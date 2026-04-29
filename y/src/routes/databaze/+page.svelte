<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';

  type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

  type Letter = {
    id: string;
    created_at: string;
    status: string;
    owner_name: string | null;
    salutation: string | null;
    property_address: string;
    lat: number | null;
    lng: number | null;
    cadastral_data: JsonValue | null;
    letter_text: string;
  };

  let letters = $state<Letter[]>([]);
  let loading = $state(true);

  onMount(async () => {
    const { data, error } = await supabase
      .from('letters')
      .select(
        'id, created_at, status, owner_name, salutation, property_address, lat, lng, cadastral_data, letter_text'
      )
      .order('created_at', { ascending: false });

    if (!error) {
      letters = (data ?? []) as Letter[];
    } else {
      console.error(error.message);
    }

    loading = false;
  });
</script>

<div class="min-h-screen bg-slate-100 p-4">
  <div class="mx-auto max-w-3xl">
    <a href={resolve('/')} class="text-sm text-slate-500">← Zpět</a>

    <h1 class="mt-4 text-2xl font-bold">Databáze</h1>

    {#if loading}
      <p class="mt-6 text-slate-500">Načítám…</p>
    {:else if letters.length === 0}
      <p class="mt-6 rounded-2xl bg-white p-5 text-slate-600 shadow">
        Zatím nemáš žádný uložený dopis.
      </p>
    {:else}
      <div class="mt-6 space-y-4">
        {#each letters as letter (letter.id)}
          <article class="rounded-2xl bg-white p-5 shadow">
            <div class="text-sm text-slate-500">
              {new Date(letter.created_at).toLocaleString('cs-CZ')}
            </div>

            <h2 class="mt-2 text-lg font-semibold">
              {letter.property_address}
            </h2>

            <p class="mt-1 text-slate-600">
              {letter.owner_name || 'Bez jména vlastníka'}
            </p>

            <details class="mt-4">
              <summary class="cursor-pointer font-medium">Zobrazit dopis</summary>
              <pre class="mt-3 whitespace-pre-wrap rounded-xl bg-slate-100 p-4 text-sm">{letter.letter_text}</pre>
            </details>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</div>