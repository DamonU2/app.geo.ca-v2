<script lang="ts">
  import { onDestroy } from 'svelte';
  import { page } from '$app/state';
  import { pickByLanguage } from '$lib/utils/language';
  import AppDialog from './app-dialog.svelte';

  const id = $props.id();
  let pending = $state<{ mode: 'confirm' | 'prompt'; message: string; resolve: (value: string | null) => void } | null>(null);
  let value = $state('');
  const cancelLabel = $derived(pickByLanguage(page.data.lang, 'Cancel', 'Annuler'));
  const confirmLabel = $derived(pickByLanguage(page.data.lang, 'Delete', 'Supprimer'));
  const saveLabel = $derived(pickByLanguage(page.data.lang, 'Save', 'Enregistrer'));
  const confirmTitle = $derived(pickByLanguage(page.data.lang, 'Confirm deletion', 'Confirmer la suppression'));
  const promptTitle = $derived(pickByLanguage(page.data.lang, 'Save as...', 'Enregistrer sous...'));

  function request(mode: 'confirm' | 'prompt', message: string, initialValue = ''): Promise<string | null> {
    if (pending) throw new Error('A dialog is already open.');
    value = initialValue;
    return new Promise((resolve) => {
      pending = { mode, message, resolve };
    });
  }

  export async function confirm(message: string): Promise<boolean> {
    return (await request('confirm', message)) !== null;
  }

  export function prompt(message: string, initialValue = ''): Promise<string | null> {
    return request('prompt', message, initialValue);
  }

  function finish(result: string | null): void {
    const current = pending;
    pending = null;
    current?.resolve(result);
  }

  onDestroy(() => finish(null));
</script>

<AppDialog
  open={pending !== null}
  title={pending?.mode === 'prompt' ? promptTitle : confirmTitle}
  describedby={pending?.mode === 'confirm' ? `${id}-message` : undefined}
  onclose={() => finish(null)}
>
  {#if pending}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        finish(pending?.mode === 'prompt' ? value : '');
      }}
    >
      {#if pending.mode === 'prompt'}
        <label for={`${id}-input`} class="mb-2 block font-custom-style-body-1">{pending.message}</label>
        <input
          id={`${id}-input`}
          type="text"
          class="mb-5 w-full rounded border border-custom-16 px-3 py-2"
          bind:value
          onfocus={(event) => event.currentTarget.select()}
        />
      {:else}
        <p id={`${id}-message`} class="mb-5 whitespace-pre-line break-words font-custom-style-body-1">{pending.message}</p>
      {/if}
      <div class="flex flex-wrap gap-3">
        <button type="button" class="button-action-light rounded px-4 py-2" onclick={() => finish(null)}>
          {cancelLabel}
        </button>
        <button type="submit" class="button-action-dark rounded px-4 py-2">
          {pending.mode === 'prompt' ? saveLabel : confirmLabel}
        </button>
      </div>
    </form>
  {/if}
</AppDialog>
