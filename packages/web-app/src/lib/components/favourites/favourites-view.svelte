<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto, pushState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { sanitizeMapConfigForStorage } from '$lib/utils/map-config-sanitizer';
  import MycartMap from '$lib/components/map/favourites-map.svelte';
  import enTranslations from '$lib/components/favourites/i18n/en/translations.json';
  import type { MapConfigFavourite } from '$lib/db/db-types';
  import type { AppLanguage } from '$lib/utils/language';

  /**
   * Shared favourites map viewer.
   *
   * Opens either selected datasets or a saved map configuration,
   * and allows signed-in users to save the current map state.
   */
  type FavouritesTranslations = typeof enTranslations;
  const translations: FavouritesTranslations = {
    ...enTranslations,
    ...((page.data.t ?? {}) as Partial<FavouritesTranslations>),
  };
  const lang = page.data.lang as AppLanguage;
  const signedIn = Boolean(page.data.signedIn);
  const userDataUnavailable = page.data.userDataStatus === 'unavailable';

  // Translations
  const mapTitle = translations.mapTitle;
  const returnToList = translations.returnToList;
  const goToDatasetsLabel = translations.datasetsLinkLabel;
  const goToMapsLabel = translations.mapsLinkLabel;
  const savedDataUnavailable = translations.savedDataUnavailable;
  const saveMapLabel = translations.saveMap;
  const saveMapHelp = translations.saveMapHelp;
  const saveMapPrompt = translations.saveMapPrompt;
  const saveMapFailed = translations.saveMapFailed;
  const saveMapSuccess = translations.saveMapSuccess;
  const savedMapsTooLarge = translations.savedMapsTooLarge;
  const mapLimitReached = translations.mapLimitReached;
  const presentationModeLabel = translations.presentationMode;
  const presentationNoticeTitle = translations.presentationNoticeTitle;
  const presentationNotice = translations.presentationNotice;
  const dismissPresentationNotice = translations.dismissPresentationNotice;
  // Shallow history updates page.state; the URL fallback supports direct links and refreshes.
  const presentationMode = $derived(page.state.presentationMode ?? page.url.searchParams.get('presentation') === '1');

  // State
  let selectedIds: string[] = $state([]);
  let selectedMapConfig: MapConfigFavourite | null = $state(null);
  let viewSource: 'datasets' | 'maps' = $state('datasets');
  let statusType: 'success' | 'error' | null = $state(null);
  let statusMessage: string = $state('');
  let loading: boolean = $state(true);
  let mapComponent: MycartMap | undefined = $state();
  let savedMaps: MapConfigFavourite[] = $state([]);
  // Dismissal overrides this value until the mode changes, so Forward shows the notice again.
  let showPresentationNotice = $derived(presentationMode);
  let mapContainer: HTMLDivElement;
  let presentationSize: { width: number; height: number } | null = $state(null);

  $effect(() => {
    if (!presentationMode) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  });

  /**
   * Generates a map name that does not collide with existing saved maps.
   *
   * Uses an incrementing numeric suffix when a matching name already exists.
   *
   * @param baseName - Preferred base map name.
   * @returns Unique map name.
   */
  function createUniqueMapName(baseName: string): string {
    const existingNames = new Set(savedMaps.map((mapItem) => mapItem.name));
    if (!existingNames.has(baseName)) {
      return baseName;
    }

    let suffix = 2;
    let candidate = `${baseName} ${suffix}`;
    while (existingNames.has(candidate)) {
      suffix += 1;
      candidate = `${baseName} ${suffix}`;
    }

    return candidate;
  }

  /**
   * Sets the transient status message shown below the map.
   *
   * Updates both status type and status text used by the inline alert container.
   *
   * @param type - Status type for styling.
   * @param message - Message content to display.
   */
  function setStatus(type: 'success' | 'error', message: string): void {
    statusType = type;
    statusMessage = message;
  }

  /**
   * Returns to datasets or maps, depending on the current view source.
   */
  function handleReturnToListClick(): void {
    goto(resolve(`/${lang}/favourites/${viewSource}`));
  }

  /**
   * Navigates back to saved maps.
   */
  function handleGoToMapsClick(): void {
    goto(resolve(`/${lang}/favourites/maps`));
  }

  /**
   * Navigates back to favourite datasets.
   */
  function handleGoToDatasetsClick(): void {
    goto(resolve(`/${lang}/favourites/datasets`));
  }

  /**
   * Dismisses the presentation notice on Escape without leaving presentation mode.
   *
   * @param event - Keyboard event from the notice dialog.
   */
  function handlePresentationNoticeKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      showPresentationNotice = false;
    }
  }

  /**
   * Enters presentation mode through shallow history, keeping the live map mounted.
   *
   * Retains its measured size when available, otherwise uses the presentation CSS fallback.
   * Does nothing when already presenting; browser Back restores the normal view.
   */
  function handleEnterPresentationMode(): void {
    if (presentationMode) return;

    // GeoView renders its footer below the map area; exclude it from the retained map height.
    const target = mapContainer.querySelector('#map-favourites-resources')?.getBoundingClientRect();
    const mapArea = mapContainer.querySelector('#map-map-favourites-resources')?.getBoundingClientRect();
    if (target) {
      presentationSize = { width: target.width, height: mapArea ? mapArea.height : target.height };
    }

    const nextUrl = new URL(page.url);
    nextUrl.searchParams.set('presentation', '1');
    pushState(resolve(`/${lang}/favourites/view${nextUrl.search}${nextUrl.hash}`), { ...page.state, presentationMode: true });
  }

  /**
   * Saves the current map state as a named saved-map configuration.
   *
   * Captures live map state, sanitizes payload size, then persists via the favourites API.
   */
  async function handleSaveMapClick(): Promise<void> {
    if (!signedIn) {
      return;
    }

    const defaultName = createUniqueMapName('My Map');
    const requestedName = prompt(saveMapPrompt, defaultName);
    if (requestedName === null) {
      return;
    }

    const mapStateConfig = mapComponent?.getMapConfigFromCurrentState() ?? selectedMapConfig?.config ?? null;
    if (!mapStateConfig) {
      setStatus('error', saveMapFailed);
      return;
    }

    // Sanitize the config to remove large style data before storing
    const sanitizedConfig = sanitizeMapConfigForStorage(mapStateConfig);

    try {
      const response = await fetch(`/${lang}/api/favourites`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createMapConfig',
          name: requestedName.trim() || defaultName,
          config: sanitizedConfig,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; mapConfigs?: MapConfigFavourite[]; reason?: string };
      if (!response.ok || !payload.ok) {
        if (payload.reason === 'limit') {
          setStatus('error', mapLimitReached);
        } else if (payload.reason === 'item-too-large') {
          setStatus('error', savedMapsTooLarge);
        } else {
          setStatus('error', saveMapFailed);
        }
        return;
      }

      savedMaps = payload.mapConfigs ?? savedMaps;
      setStatus('success', saveMapSuccess);
    } catch {
      setStatus('error', saveMapFailed);
    }
  }

  /**
   * Resolves viewer inputs from query params and route data.
   *
   * Determines source context, selects map by id or dataset ids, and redirects when inputs are invalid.
   */
  onMount(async () => {
    const source = page.url.searchParams.get('source');
    viewSource = source === 'maps' ? 'maps' : 'datasets';

    if (signedIn) {
      savedMaps = page.data?.userData?.mapConfigs ? [...page.data.userData.mapConfigs] : [];
    }

    const mapId = page.url.searchParams.get('mapId');
    const idsParam = page.url.searchParams.get('ids');

    if (signedIn && userDataUnavailable && viewSource === 'maps' && mapId) {
      loading = false;
      return;
    }

    if (mapId) {
      selectedMapConfig = savedMaps.find((mapConfig) => mapConfig.id === mapId) ?? null;
    }

    if (!selectedMapConfig) {
      selectedIds = (idsParam ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
    }

    if (!selectedMapConfig && selectedIds.length === 0) {
      await goto(resolve(`/${lang}/favourites/datasets`), { replaceState: true });
      return;
    }

    loading = false;
  });
</script>

{#if !presentationMode}
  <h1 class="page-title-favourites font-custom-style-h1">
    {selectedMapConfig ? selectedMapConfig.name : mapTitle}
  </h1>
{/if}

<div
  bind:this={mapContainer}
  class={presentationMode ? 'presentation-map-shell' : 'page-section-favourites'}
  style:--presentation-width={presentationSize ? `${presentationSize.width}px` : undefined}
  style:--presentation-height={presentationSize ? `${presentationSize.height}px` : undefined}
>
  {#if !loading}
    {#if selectedMapConfig || selectedIds.length > 0}
      <MycartMap
        layerIds={selectedIds}
        mapConfig={selectedMapConfig?.config ?? null}
        bind:this={mapComponent}
      />
    {:else if userDataUnavailable && viewSource === 'maps'}
      <div class="status-alert-error font-custom-style-body-1" role="status" aria-live="polite">
        {savedDataUnavailable}
      </div>
    {/if}
    {#if !presentationMode}
      {#if statusType && statusMessage}
        <div
          class={`mt-5 status-alert-base font-custom-style-body-1 ${statusType === 'success' ? 'status-alert-success' : 'status-alert-danger'}`}
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </div>
      {/if}
      {#if signedIn && (selectedMapConfig || selectedIds.length > 0)}
        <p class="font-custom-style-body-1 mx-0 pt-5 mb-2">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html saveMapHelp}
        </p>
      {/if}
      <div class="flex flex-wrap gap-3 mt-5 mb-5">
        {#if signedIn}
          <button class="button-inline-desktop button-action-dark surface-shadow button-width-mobile-full" onclick={handleGoToDatasetsClick}>
            {goToDatasetsLabel}
          </button>
          <button class="button-inline-desktop button-action-dark surface-shadow button-width-mobile-full" onclick={handleGoToMapsClick}>
            {goToMapsLabel}
          </button>
        {:else}
          <button class="button-inline-desktop button-action-dark surface-shadow button-width-mobile-full" onclick={handleReturnToListClick}>
            {returnToList}
          </button>
        {/if}

        {#if signedIn && (selectedMapConfig || selectedIds.length > 0)}
          <button class="button-inline-desktop button-action-light surface-shadow button-width-mobile-full" onclick={handleSaveMapClick}>
            {saveMapLabel}
          </button>
        {/if}
        {#if selectedMapConfig || selectedIds.length > 0}
          <button class="button-inline-desktop button-action-light surface-shadow button-width-mobile-full" onclick={handleEnterPresentationMode}>
            {presentationModeLabel}
          </button>
        {/if}
      </div>
    {/if}
  {:else}
    <div class={presentationMode ? 'animate-pulse bg-custom-6 h-full w-full' : 'animate-pulse bg-custom-6 w-full h-[32rem]'}></div>
  {/if}
</div>

{#if presentationMode && showPresentationNotice}
  <div class="fixed inset-0 z-11100 flex items-center justify-center bg-black/40 p-4" role="presentation">
    <dialog
      open
      class="static m-0 w-full max-w-md rounded border border-custom-16 bg-white p-6 shadow-lg"
      aria-modal="true"
      aria-labelledby="presentation-notice-title"
      aria-describedby="presentation-notice-description"
      onkeydown={handlePresentationNoticeKeydown}
    >
      <h2 id="presentation-notice-title" class="mb-3 text-xl font-bold">{presentationNoticeTitle}</h2>
      <p id="presentation-notice-description" class="mb-5">{presentationNotice}</p>
      <button class="button-action-dark rounded px-4 py-2" onclick={() => (showPresentationNotice = false)}>
        {dismissPresentationNotice}
      </button>
    </dialog>
  </div>
{/if}

<style>
  .presentation-map-shell {
    position: fixed;
    inset: 0;
    z-index: 10020;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    box-sizing: border-box;
    padding: 24px;
    background: white;
  }

  .presentation-map-shell :global(#map-favourites-resources) {
    width: min(100%, var(--presentation-width, 1240px));
    height: var(--presentation-height, auto) !important;
    max-height: none;
    aspect-ratio: 16 / 9;
    margin-inline: auto;
    border: 0 !important;
    box-sizing: border-box;
    background: transparent;
    box-shadow: none;
  }

  .presentation-map-shell :global(#shell-map-favourites-resources) {
    border: 1px solid gray;
    box-sizing: border-box;
  }
</style>
