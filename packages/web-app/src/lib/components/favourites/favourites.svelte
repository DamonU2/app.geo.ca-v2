<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { updateLocalStorage } from '$lib/utils/event-dispatchers/local-storage-changed';
  import { FAVOURITES_STORAGE_KEY, getStoredFavourites, resolveInitialFavourites } from '$lib/utils/favourites-storage';
  import Card from '$lib/components/card/card.svelte';
  import NoMap from '$lib/components/icons/no-map.svelte';
  import MycartMap from '$lib/components/map/favourites-map.svelte';
  import SortableTable from '$lib/components/sortable-table/sortable-table.svelte';
  import FavouritesListSkeleton from '$lib/components/loading-mask/favourites-list-skeleton.svelte';
  import Checkmark from '$lib/components/icons/checkmark.svelte';
  import GarbageCan from '$lib/components/icons/garbage-can.svelte';
  import UploadIcon from '$lib/components/icons/upload.svelte';
  import DownloadIcon from '$lib/components/icons/download.svelte';
  import MapIcon from '$lib/components/icons/map.svelte';
  import SearchBarSimplified from '$lib/components/search-results/search-bar-simplified.svelte';
  import type { FavouritesRecord, FavouritesRow, MapConfigFavourite } from '$lib/db/db-types';
  import type { AppLanguage } from '$lib/utils/language';
  import { isFrench, pickByLanguage } from '$lib/utils/language';

  let mapComponent: MycartMap | undefined = $state();

  const translations = page.data.t;
  const lang = page.data.lang as AppLanguage;
  const signedIn = Boolean(page.data.signedIn);

  const findAResource = translations?.findAResource ? translations.findAResource : 'Find a resource';
  const favouritesTitle = translations?.title ? translations.title : 'Favourites';
  const mapTitle = translations?.mapTitle ? translations.mapTitle : 'Map';
  const datasetsDescription =
    translations?.datasetsDescription && typeof translations.datasetsDescription === 'string'
      ? translations.datasetsDescription
      : translations?.description && typeof translations.description === 'string'
        ? translations.description
        : '';
  const mapsDescription =
    translations?.mapsDescription && typeof translations.mapsDescription === 'string'
      ? translations.mapsDescription
      : 'Saved maps let you quickly reopen the map view you configured earlier. Use Upload config to import one, View map to load one, Download to export its JSON configuration, or Delete to remove it from this list.';
  const remove = translations?.remove ? translations.remove : 'Remove';
  const removeAll = translations?.removeAll ? translations.removeAll : 'Remove all';
  const resourceFormatsLabel = translations?.resourceFormats ? translations.resourceFormats : 'Resource formats';
  const resourceListEmpty = translations?.resourceListEmpty ? translations.resourceListEmpty : 'The resource list is empty.';
  const resourceNameLabel = translations?.resourceName ? translations.resourceName : 'Resource name';
  const returnToList = translations?.returnToList ? translations.returnToList : 'Return to list';
  const searchFor = translations?.searchFor ? translations.searchFor : 'Search for additional resources';
  const viewOnMapLabel = translations?.viewOnMap ? translations.viewOnMap : 'View on map';
  const viewMapLabel = translations?.viewMap ? translations.viewMap : 'View map';
  const datasetsTabLabel = translations?.datasetsTab ? translations.datasetsTab : 'Datasets';
  const mapsTabLabel = translations?.mapsTab ? translations.mapsTab : 'Maps';
  const saveMapLabel = translations?.saveMap ? translations.saveMap : 'Save map';
  const saveMapHelp =
    translations?.saveMapHelp && typeof translations.saveMapHelp === 'string'
      ? translations.saveMapHelp
      : 'Click on Save map to save a config of the map as it currently looks, including open tabs and any panning or zooming.';
  const deleteMapLabel = translations?.deleteMap ? translations.deleteMap : 'Delete';
  const downloadMapLabel = translations?.downloadMap ? translations.downloadMap : 'Download config';
  const uploadMapLabel = translations?.uploadMap ? translations.uploadMap : 'Upload config';
  const savedMapsEmptyLabel = translations?.savedMapsEmpty ? translations.savedMapsEmpty : 'You have no saved maps yet.';
  const uploadMapFailed =
    translations?.uploadMapFailed && typeof translations.uploadMapFailed === 'string'
      ? translations.uploadMapFailed
      : 'Unable to upload the config file. Please check the file format and try again.';
  const uploadMapSuccess =
    translations?.uploadMapSuccess && typeof translations.uploadMapSuccess === 'string'
      ? translations.uploadMapSuccess
      : 'Config imported successfully.';
  const saveMapPrompt =
    translations?.saveMapPrompt && typeof translations.saveMapPrompt === 'string'
      ? translations.saveMapPrompt
      : 'Enter a name for this map';
  const saveMapFailed =
    translations?.saveMapFailed && typeof translations.saveMapFailed === 'string'
      ? translations.saveMapFailed
      : 'Unable to save the current map. Please try again.';
  const saveMapSuccess =
    translations?.saveMapSuccess && typeof translations.saveMapSuccess === 'string'
      ? translations.saveMapSuccess
      : 'Map saved successfully.';
  const mapLimitReached =
    translations?.mapLimitReached && typeof translations.mapLimitReached === 'string'
      ? translations.mapLimitReached
      : 'You have reached the maximum number of saved maps (25).';
  const deleteMapFailed =
    translations?.deleteMapFailed && typeof translations.deleteMapFailed === 'string'
      ? translations.deleteMapFailed
      : 'Unable to delete this saved map. Please try again.';
  const deleteMapSuccess =
    translations?.deleteMapSuccess && typeof translations.deleteMapSuccess === 'string'
      ? translations.deleteMapSuccess
      : 'Saved map deleted.';

  const langShort = pickByLanguage(lang, 'en', 'fr');
  const titleKey = `title_${langShort}` as 'title_en' | 'title_fr';

  /************* Resource Table ***************/
  let sortableTable: SortableTable | undefined = $state();
  let selectedIds: string[] = $state([]);
  let numSelected: number = $derived(selectedIds.length);
  let loading: boolean = $state(true);
  let mapToggle: boolean = $state(false);
  let activeTab: 'datasets' | 'maps' = $state('datasets');
  let selectedMapConfig: MapConfigFavourite | null = $state(null);
  let statusType: 'success' | 'error' | null = $state(null);
  let statusMessage: string = $state('');

  let favouriteRecordList: string[] = $state(page.data?.userData?.favourites ? [...page.data.userData.favourites] : []);
  let savedMaps: MapConfigFavourite[] = $state(page.data?.userData?.mapConfigs ? [...page.data.userData.mapConfigs] : []);
  let records: FavouritesRecord[] = $state([]);
  let tableDataArray: FavouritesRow[] = $state([]);

  // Derive allSelected state: true only if all non-disabled rows are selected
  let allSelected = $derived(
    tableDataArray.length > 0 && tableDataArray.every((row) => selectedIds.includes(row.id) || row.disableCheckbox)
  );

  // Table column labels
  const tableLabels: Record<string, string> = {
    name: resourceNameLabel,
    formats: resourceFormatsLabel,
  };

  /************* Handlers ***************/

  /**
   * Handle deleting a resource from the favourites list.
   *
   * @param id - The ID of the resource to delete.
   */
  async function handleDeleteResource(id: string): Promise<void> {
    // Before deleting, ask the user's permission
    const resource = tableDataArray.find((tableData: FavouritesRow) => tableData.id === id);
    const resourceName = resource?.name;
    const permissionText = isFrench(lang)
      ? `Êtes-vous sûr de vouloir supprimer la ressource suivante? \n\n${resourceName} (${id})`
      : `Are you sure you want to delete the following resource? \n\n${resourceName} (${id})`;

    if (confirm(permissionText) === true) {
      // If the user confirms, proceed with deletion. For signed-in users, also update the server-side favourites.
      if (signedIn) {
        const response = await fetch(`/${lang}/api/favourites`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (!response.ok) {
          return;
        }
      }

      let selectedSet = new SvelteSet<string>(sortableTable?.getSelectedIds());
      selectedSet.delete(id);

      // Update resource lists
      favouriteRecordList = favouriteRecordList.filter((listItem) => listItem !== id);
      tableDataArray = tableDataArray.filter((row) => row.id !== id);
      records = records.filter((record) => record.id !== id);

      // Update the table and button label
      sortableTable?.updateTableContent(tableDataArray);
      sortableTable?.setSelectedIds(Array.from(selectedSet));

      // Update localStorage and dispatch localstorage_updated event
      updateLocalStorage(FAVOURITES_STORAGE_KEY, favouriteRecordList);
    }
  }

  /**
   * Handle removing all resources from the favourites list.
   */
  async function handleRemoveAllClick(): Promise<void> {
    const permissionText = isFrench(lang)
      ? `Êtes-vous certain de vouloir supprimer ${favouriteRecordList.length} ressources?`
      : `Are you sure you want to delete ${favouriteRecordList.length} resources?`;

    if (confirm(permissionText) === true) {
      // If the user confirms, proceed with deletion. For signed-in users, also update the server-side favourites.
      if (signedIn) {
        const response = await fetch(`/${lang}/api/favourites`, {
          method: 'PUT',
        });
        if (!response.ok) {
          return;
        }
      }

      // Update resource lists
      favouriteRecordList = [];
      tableDataArray = [];
      records = [];

      // Update the table and button label
      sortableTable?.updateTableContent([]);
      sortableTable?.setSelectedIds([]);

      // Update localStorage and dispatch localstorage_updated event
      updateLocalStorage(FAVOURITES_STORAGE_KEY, []);
    }
  }

  /**
   * Handle opening the map view.
   */
  function handleOpenMapClick(): void {
    clearStatus();
    selectedMapConfig = null;
    mapToggle = true;
    scrollToTop();
  }

  /**
   * Handle opening a saved map config in map view.
   */
  function handleOpenSavedMapClick(mapConfig: MapConfigFavourite): void {
    clearStatus();
    selectedMapConfig = mapConfig;
    mapToggle = true;
    scrollToTop();
  }

  /**
   * Handle returning to the list view from the map.
   */
  function handleReturnToListClick(): void {
    // Remove the map viewer to avoid conflicts
    if (mapComponent) {
      mapComponent.destroyMapViewer();
    }

    clearStatus();
    selectedMapConfig = null;
    mapToggle = false;
    scrollToTop();
  }

  /**
   * Shows an inline status message.
   */
  function setStatus(type: 'success' | 'error', message: string): void {
    statusType = type;
    statusMessage = message;
  }

  /**
   * Clears the current status message.
   */
  function clearStatus(): void {
    statusType = null;
    statusMessage = '';
  }

  /**
   * Returns focus to the top of the page after tab/view transitions.
   */
  function scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Updates the active tab and keeps the URL query parameter in sync.
   */
  async function setActiveTab(tab: 'datasets' | 'maps'): Promise<void> {
    activeTab = tab;
    clearStatus();

    await goto(resolve(`/${lang}/favourites?tab=${tab}`), {
      replaceState: true,
      noScroll: false,
      keepFocus: true,
    });

    scrollToTop();
  }

  /**
   * Syncs the active favourites tab from the current URL query string.
   */
  function syncActiveTabFromUrl(): void {
    if (!signedIn || mapToggle) {
      return;
    }

    const tab = page.url.searchParams.get('tab');
    if (tab === 'datasets' || tab === 'maps') {
      activeTab = tab;
    }
  }

  /**
   * Formats saved-map created timestamp in the current language.
   */
  function formatCreatedAt(value: string): string {
    if (!value) {
      return '';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(lang, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed);
  }

  $effect(() => {
    syncActiveTabFromUrl();
  });

  /**
   * Creates a unique default map name based on existing saved maps.
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
   * Saves the currently displayed map state for signed-in users.
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

    // If map-state extraction fails, fallback to the opened saved map config.
    const mapStateConfig = mapComponent?.getMapConfigFromCurrentState() ?? selectedMapConfig?.config ?? null;
    if (!mapStateConfig) {
      setStatus('error', saveMapFailed);
      return;
    }

    try {
      const response = await fetch(`/${lang}/api/favourites`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createMapConfig',
          name: requestedName.trim() || defaultName,
          config: mapStateConfig,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; mapConfigs?: MapConfigFavourite[]; reason?: string };
      if (!response.ok || !payload.ok) {
        setStatus('error', payload.reason === 'limit' ? mapLimitReached : saveMapFailed);
        return;
      }

      savedMaps = payload.mapConfigs ?? savedMaps;
      setStatus('success', saveMapSuccess);
    } catch {
      setStatus('error', saveMapFailed);
    }
  }

  /**
   * Removes a saved map config from favourites.
   */
  async function handleDeleteSavedMapClick(id: string): Promise<void> {
    const permissionText = pickByLanguage(
      lang,
      'Are you sure you want to delete this saved map?',
      'Êtes-vous sûr de vouloir supprimer cette carte enregistrée?'
    );

    if (!confirm(permissionText)) {
      return;
    }

    const response = await fetch(`/${lang}/api/favourites`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteMapConfig', id }),
    });

    const payload = (await response.json()) as { ok: boolean; mapConfigs?: MapConfigFavourite[] };
    if (!response.ok || !payload.ok) {
      setStatus('error', deleteMapFailed);
      return;
    }

    savedMaps = payload.mapConfigs ?? [];
    setStatus('success', deleteMapSuccess);
  }

  /**
   * Downloads a saved map config as a JSON file.
   */
  function handleDownloadSavedMapClick(mapConfig: MapConfigFavourite): void {
    const fileName = `${mapConfig.name.trim().replace(/\s+/g, '-') || 'my-map'}.json`;
    const blob = new Blob([JSON.stringify(mapConfig.config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Handles uploading a map config from a JSON file.
   */
  async function handleUploadMapClick(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const config = JSON.parse(text);

        if (typeof config !== 'object' || config === null || Array.isArray(config)) {
          setStatus('error', uploadMapFailed);
          return;
        }

        const fileName = file.name.replace(/\.json$/i, '');
        const finalName = createUniqueMapName(fileName || 'Imported Map');

        const response = await fetch(`/${lang}/api/favourites`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'createMapConfig',
            name: finalName,
            config,
          }),
        });

        const payload = (await response.json()) as { ok: boolean; mapConfigs?: MapConfigFavourite[]; reason?: string };
        if (!response.ok || !payload.ok) {
          setStatus('error', payload.reason === 'limit' ? mapLimitReached : uploadMapFailed);
          return;
        }

        savedMaps = payload.mapConfigs ?? savedMaps;
        setStatus('success', uploadMapSuccess);
      } catch {
        setStatus('error', uploadMapFailed);
      }
    };

    input.click();
  }

  // Local storage is only accessible from the client side, so we need to get
  // the FavouritesResources array inside onMount
  onMount(async () => {
    syncActiveTabFromUrl();

    const storedFavourites = getStoredFavourites(localStorage);
    const resolved = resolveInitialFavourites(signedIn, favouriteRecordList, storedFavourites);
    favouriteRecordList = resolved.favourites;

    if (resolved.shouldSyncLocalStorage) {
      updateLocalStorage(FAVOURITES_STORAGE_KEY, favouriteRecordList);
    }

    if (signedIn) {
      savedMaps = page.data?.userData?.mapConfigs ? [...page.data.userData.mapConfigs] : [];
    }

    // Issue POST request for record details
    if (favouriteRecordList.length > 0) {
      const response = await fetch(`/${lang}/favourites`, {
        method: 'POST',
        body: JSON.stringify({ ids: favouriteRecordList, lang: lang }),
        headers: { 'Content-Type': 'application/json' },
      });

      records = await response.json();

      tableDataArray = records.map((record: FavouritesRecord) => {
        return {
          disableCheckbox: !record.hasMapLayer,
          id: record.id,
          formats: record.formats.join(', '),
          name: record[titleKey],
          url: `${page.url.origin}/${lang}/map-browser/record/${record.id}`,
        };
      });

      // Select all non-disabled rows by default
      selectedIds = tableDataArray.filter((row) => !row.disableCheckbox).map((row) => row.id);
    }

    // Turn off the loading mask once the records have finished loading
    loading = false;
  });
</script>

<h1 class="mt-12 mb-7 mx-5 md:mx-0 font-custom-style-h1 md:mr-auto leading-tight">
  {#if mapToggle}
    {selectedMapConfig ? selectedMapConfig.name : mapTitle}
  {:else}
    {favouritesTitle}
  {/if}
</h1>

<div class="mx-5 md:mx-0 mb-5">
  {#if signedIn && !mapToggle}
    <div class="mb-6 flex flex-wrap gap-3">
      <button
        class={activeTab === 'datasets'
          ? 'button-5 shadow-[0_0.1875rem_0.375rem_#00000029]'
          : 'button-3 shadow-[0_0.1875rem_0.375rem_#00000029]'}
        onclick={() => setActiveTab('datasets')}
      >
        {datasetsTabLabel}
      </button>
      <button
        class={activeTab === 'maps'
          ? 'button-5 shadow-[0_0.1875rem_0.375rem_#00000029]'
          : 'button-3 shadow-[0_0.1875rem_0.375rem_#00000029]'}
        onclick={() => setActiveTab('maps')}
      >
        {mapsTabLabel}
      </button>
    </div>
  {/if}

  {#if !loading}
    {#if mapToggle}
      <!-------------- Map ------------->
      <MycartMap layerIds={selectedIds} mapConfig={selectedMapConfig ? selectedMapConfig.config : null} bind:this={mapComponent} />
      {#if statusType && statusMessage}
        <div
          class={`mt-5 rounded border px-4 py-3 font-custom-style-body-1 ${statusType === 'success' ? 'border-green-600 bg-green-50 text-green-900' : 'border-red-600 bg-red-50 text-red-900'}`}
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </div>
      {/if}
      {#if signedIn}
        <p class="font-custom-style-body-1 mx-0 pt-5 mb-2">
          <!-- These are our descriptions, no injection risk -->
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html saveMapHelp}
        </p>
      {/if}
      <div class="flex flex-wrap gap-3 mt-5 mb-5">
        <button class="sm:inline-block button-5 w-full sm:w-fit shadow-[0_0.1875rem_0.375rem_#00000029]" onclick={handleReturnToListClick}>
          {returnToList}
        </button>

        {#if signedIn}
          <button class="sm:inline-block button-3 w-full sm:w-fit shadow-[0_0.1875rem_0.375rem_#00000029]" onclick={handleSaveMapClick}>
            {saveMapLabel}
          </button>
        {/if}
      </div>
    {:else if signedIn && activeTab === 'maps'}
      <!-------------- Saved maps ------------->
      <p class="font-custom-style-body-1 mx-0 mb-6">
        <!-- These are our descriptions, no injection risk -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html mapsDescription}
      </p>

      {#if statusType && statusMessage}
        <div
          class={`mb-4 rounded border px-4 py-3 font-custom-style-body-1 ${statusType === 'success' ? 'border-green-600 bg-green-50 text-green-900' : 'border-red-600 bg-red-50 text-red-900'}`}
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </div>
      {/if}
      <div>
        <button class="button-3 w-full sm:w-fit shadow-[0_0.1875rem_0.375rem_#00000029]" onclick={handleUploadMapClick}>
          <UploadIcon classes="h-5 inline mb-1" />
          {uploadMapLabel}
        </button>
      </div>
      {#if savedMaps.length > 0}
        <Card>
          <div class="divide-y divide-custom-17">
            {#each savedMaps as mapItem (mapItem.id)}
              <div class="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 class="font-custom-style-h2-2">{mapItem.name}</h2>
                  <p class="font-custom-style-body-9">{formatCreatedAt(mapItem.createdAt)}</p>
                </div>

                <div class="flex flex-wrap gap-2">
                  <button
                    class="button-5 shadow-[0_0.1875rem_0.375rem_#00000029]"
                    onclick={() => {
                      handleOpenSavedMapClick(mapItem);
                    }}
                  >
                    <MapIcon classes="h-5 inline mb-1" />
                    {viewMapLabel}
                  </button>
                  <button
                    class="button-3 shadow-[0_0.1875rem_0.375rem_#00000029]"
                    onclick={() => {
                      handleDownloadSavedMapClick(mapItem);
                    }}
                  >
                    <DownloadIcon classes="h-5 inline mb-1" />
                    {downloadMapLabel}
                  </button>
                  <button
                    class="button-3 shadow-[0_0.1875rem_0.375rem_#00000029]"
                    onclick={() => {
                      handleDeleteSavedMapClick(mapItem.id);
                    }}
                  >
                    <GarbageCan classes="h-4 inline mb-1" />
                    {deleteMapLabel}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </Card>
      {:else}
        <p class="font-custom-style-body-1">{savedMapsEmptyLabel}</p>
      {/if}
    {:else if records.length > 0}
      <!-------------- List -------------->
      <p class="font-custom-style-body-1 mx-0 mb-6">
        <!-- These are our descriptions, no injection risk -->
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html datasetsDescription}
      </p>

      <Card>
        <!-- Table for medium to large screens-->
        <div class="hidden sm:table w-full">
          <SortableTable
            tableContent={tableDataArray}
            {tableLabels}
            clickableRows={true}
            checkboxCol={true}
            {allSelected}
            removeCol={true}
            paginated={false}
            deleteResource={handleDeleteResource}
            bind:this={sortableTable}
            bind:selectedIds
          />
        </div>

        <!-- Cards for moble screens -->
        <div class="block sm:hidden rounded bg-custom-1 px-5 drop-shadow-[0_0.1875rem_0.375rem_#00000029] divide-y divide-custom-17">
          {#each tableDataArray as item (item.id)}
            <div class="flex items-center py-5">
              <!-- Checkboxes -->
              <div class="flex pointer-events-auto hover:cursor-pointer w-16 ml-4">
                <input
                  type="checkbox"
                  id={`check-${item.id}`}
                  name={`check-${item.id}`}
                  class="peer appearance-none min-w-[1.6875rem] h-[1.6875rem] border-2
                      border-custom-16 rounded-sm bg-custom-1 checked:bg-custom-16 hover:cursor-pointer"
                  checked={selectedIds.includes(item.id)}
                  onchange={(event: Event) => {
                    const idSet = new SvelteSet(selectedIds);
                    if ((event.target as HTMLInputElement).checked) {
                      idSet.add(item.id);
                    } else {
                      idSet.delete(item.id);
                    }
                    selectedIds = Array.from(idSet);
                  }}
                />
                <Checkmark
                  classes="absolute h-4 mt-1.5 ml-1.5 hidden peer-checked:block
                      pointer-events-none text-custom-1"
                />
              </div>

              <!-- Resource -->
              <div class="flex-1">
                <!-- Resource data-->
                <a href={resolve(`/${lang}/map-browser/record/${item.id}`)} class="font-custom-style-h2-2 block">
                  {item.name}
                </a>
                <p class="font-custom-style-body-9">{item.id}</p>

                <!-- Remove Button-->
                <button
                  class="button-3 mt-4 p-2 text-custom-16 rounded border-2 border-transparent hover:border-custom-16
                      hover:text-custom-1 hover:bg-custom-16 hover:shadow-[0_0.1875rem_0.375rem_#00000029]"
                  onclick={() => handleDeleteResource(item.id)}
                >
                  <GarbageCan classes="h-4 inline mb-1" />
                  {remove}
                </button>
              </div>
            </div>
          {/each}
        </div>

        <!-------------- buttons -------------->
        <div class="sm:flex">
          <div class="sm:grow">
            <button
              class="sm:inline-block button-5 w-full sm:w-fit mb-4 sm:mb-0 shadow-[0_0.1875rem_0.375rem_#00000029]"
              onclick={handleOpenMapClick}
            >
              {viewOnMapLabel} ({numSelected})
            </button>
          </div>

          <button class="sm:inline-block button-3 w-full sm:w-fit shadow-[0_0.1875rem_0.375rem_#00000029]" onclick={handleRemoveAllClick}>
            <GarbageCan classes="h-4 inline mb-1" />
            {removeAll}
          </button>
        </div>
      </Card>

      <h2 class="mb-4 mt-9 mx-0 font-custom-style-h2 md:mr-auto">
        {searchFor}
      </h2>
      <SearchBarSimplified />
    {:else}
      <!-------------- No records selected ------------->
      <div class="my-8">
        <NoMap classes="text-custom-19 m-auto h-48 md:h-80 lg:h-96" />

        <p class="block m-auto w-fit font-custom-style-h2 text-center">
          {resourceListEmpty}
        </p>

        <a class="block m-auto w-fit mt-5" href={resolve(`/${lang}/map-browser`)}>
          <div class="button-3 w-fit shadow-[0_0.1875rem_0.375rem_#00000029]">
            {findAResource}
          </div>
        </a>
      </div>
    {/if}
  {:else if mapToggle}
    <!-- Map loading mask -->
    <div class="animate-pulse bg-custom-6 w-full h-[32rem]"></div>
  {:else if !mapToggle}
    <!-- Table loading skeleton -->
    <FavouritesListSkeleton numRecords={6} />
  {/if}
</div>
