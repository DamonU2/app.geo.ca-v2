<script lang="ts">
  import { resolve } from '$app/paths';
  import { slide } from 'svelte/transition';
  import { page } from '$app/state';
  import { pickByLanguage } from '$lib/utils/language';
  import { FAVOURITES_STORAGE_KEY } from '$lib/utils/favourites-storage';

  type Props = {
    light?: boolean;
  };

  let { light = false }: Props = $props();

  const lang = page.data.lang;
  const signedIn = $derived(Boolean(page.data.signedIn));
  const featureSignIn = $derived(page.data.FEATURE_SIGN_IN !== false);

  const signInText = $derived(pickByLanguage(lang, 'Sign in', 'Connexion'));
  const signOutText = $derived(pickByLanguage(lang, 'Sign out', 'Deconnexion'));

  /**
   * Temporarily stores guest favourites before redirecting to sign-in,
   * so they can be merged after authentication.
   */
  function cacheGuestFavouritesForMerge(): void {
    const favourites = localStorage.getItem(FAVOURITES_STORAGE_KEY);
    if (!favourites) {
      return;
    }

    const encoded = encodeURIComponent(favourites);
    document.cookie = `guest_favourites=${encoded}; Path=/; Max-Age=600; SameSite=Lax`;
  }

  /**
   * Starts sign-in and preserves the current URL in state for return navigation.
   */
  function handleSignInClick(): void {
    cacheGuestFavouritesForMerge();
    const state = encodeURIComponent(page.url.href);
    window.location.href = `/${lang}/sign-in/send?state=${state}`;
  }
</script>

<div class="flex h-full items-center whitespace-nowrap">
  {#if featureSignIn}
    {#if signedIn}
      <a transition:slide data-sveltekit-reload href={resolve(`/${lang}/sign-in/oidc-logout`)} class="divide-y divide-custom-16">
        <button class={light ? 'button-2' : 'button-1'}>{signOutText}</button>
      </a>
    {:else}
      <button class={light ? 'button-2' : 'button-1'} onclick={handleSignInClick}>{signInText}</button>
    {/if}
  {/if}
</div>
