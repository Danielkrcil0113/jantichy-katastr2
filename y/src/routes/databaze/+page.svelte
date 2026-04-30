<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';

  type Letter = {
    id: string;
    created_at: string;
    status: string | null;

    owner_name: string | null;
    owner_first_name: string | null;
    owner_last_name: string | null;
    owner_full_name: string | null;
    owner_address: string | null;
    owner_city: string | null;
    owner_postal_code: string | null;

    salutation: string | null;

    property_address: string;
    lat: number | null;
    lng: number | null;

    property_city: string | null;
    property_region: string | null;
    property_district: string | null;
    property_municipality: string | null;
    property_part: string | null;

    cadastral_area: string | null;
    cadastral_area_code: number | null;

    property_type: string | null;
    iskn_property_id: string | null;
    lv_number: number | null;
    parcel_number: string | null;
    building_numbers: string | null;
    land_area_m2: number | null;
    land_type: string | null;
    usage_type: string | null;

    cuzk_verified: boolean | null;
    cuzk_source: string | null;
    cuzk_message: string | null;

    letter_text: string;
  };

  type LetterPhotoRow = {
    letter_id: string;
    storage_path: string;
  };

  type LetterPhoto = {
    letter_id: string;
    storage_path: string;
    signedUrl: string | null;
  };

  type SortBy =
    | 'newest'
    | 'oldest'
    | 'city'
    | 'region'
    | 'owner'
    | 'cadastral'
    | 'status';

  const statusOptions = [
    { value: 'saved', label: 'Uloženo' },
    { value: 'prepared', label: 'Připraveno' },
    { value: 'sent', label: 'Odesláno' },
    { value: 'archived', label: 'Archivováno' }
  ];

  let letters = $state<Letter[]>([]);
  let letterPhotos = $state<Record<string, LetterPhoto[]>>({});

  let loading = $state(true);
  let errorMessage = $state('');
  let photoErrorMessage = $state('');

  let search = $state('');
  let selectedCity = $state('all');
  let selectedRegion = $state('all');
  let selectedDistrict = $state('all');
  let selectedCadastralArea = $state('all');
  let selectedStatus = $state('all');
  let selectedVerified = $state('all');
  let sortBy = $state<SortBy>('newest');

  let updatingId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);

  let cityOptions = $derived(uniqueOptions(letters.map((letter) => letter.property_city)));
  let regionOptions = $derived(uniqueOptions(letters.map((letter) => letter.property_region)));
  let districtOptions = $derived(uniqueOptions(letters.map((letter) => letter.property_district)));
  let cadastralAreaOptions = $derived(
    uniqueOptions(letters.map((letter) => letter.cadastral_area))
  );

  let filteredLetters = $derived.by(() => {
    const q = normalizeText(search);

    const filtered = letters.filter((letter) => {
      const searchableValues = [
        letter.property_address,
        letter.owner_name,
        letter.owner_full_name,
        letter.owner_first_name,
        letter.owner_last_name,
        letter.owner_city,
        letter.property_city,
        letter.property_region,
        letter.property_district,
        letter.property_municipality,
        letter.property_part,
        letter.cadastral_area,
        letter.parcel_number,
        letter.building_numbers,
        letter.lv_number,
        letter.property_type,
        letter.land_type,
        letter.usage_type,
        letter.cuzk_message,
        letter.letter_text
      ];

      const matchesSearch =
        !q || searchableValues.some((value) => normalizeText(value).includes(q));

      const matchesCity = selectedCity === 'all' || letter.property_city === selectedCity;

      const matchesRegion =
        selectedRegion === 'all' || letter.property_region === selectedRegion;

      const matchesDistrict =
        selectedDistrict === 'all' || letter.property_district === selectedDistrict;

      const matchesCadastralArea =
        selectedCadastralArea === 'all' || letter.cadastral_area === selectedCadastralArea;

      const matchesStatus =
        selectedStatus === 'all' || (letter.status || 'saved') === selectedStatus;

      const matchesVerified =
        selectedVerified === 'all' ||
        (selectedVerified === 'yes' && letter.cuzk_verified === true) ||
        (selectedVerified === 'no' && letter.cuzk_verified !== true);

      return (
        matchesSearch &&
        matchesCity &&
        matchesRegion &&
        matchesDistrict &&
        matchesCadastralArea &&
        matchesStatus &&
        matchesVerified
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }

      if (sortBy === 'city') {
        return compareText(a.property_city, b.property_city);
      }

      if (sortBy === 'region') {
        return compareText(a.property_region, b.property_region);
      }

      if (sortBy === 'owner') {
        return compareText(getOwnerName(a), getOwnerName(b));
      }

      if (sortBy === 'cadastral') {
        return compareText(a.cadastral_area, b.cadastral_area);
      }

      if (sortBy === 'status') {
        return compareText(a.status, b.status);
      }

      return 0;
    });
  });

  let totalVerified = $derived(
    letters.filter((letter) => letter.cuzk_verified === true).length
  );

  let totalUnverified = $derived(
    letters.filter((letter) => letter.cuzk_verified !== true).length
  );

  let totalCities = $derived(cityOptions.length);

  let totalPhotos = $derived(
    Object.values(letterPhotos).reduce((sum, photos) => sum + photos.length, 0)
  );

  onMount(() => {
    void loadLetters();
  });

  async function loadLetters() {
    loading = true;
    errorMessage = '';
    photoErrorMessage = '';
    letterPhotos = {};

    const { data, error } = await supabase
      .from('letters')
      .select(
        `
          id,
          created_at,
          status,

          owner_name,
          owner_first_name,
          owner_last_name,
          owner_full_name,
          owner_address,
          owner_city,
          owner_postal_code,

          salutation,

          property_address,
          lat,
          lng,

          property_city,
          property_region,
          property_district,
          property_municipality,
          property_part,

          cadastral_area,
          cadastral_area_code,

          property_type,
          iskn_property_id,
          lv_number,
          parcel_number,
          building_numbers,
          land_area_m2,
          land_type,
          usage_type,

          cuzk_verified,
          cuzk_source,
          cuzk_message,

          letter_text
        `
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error.message);
      errorMessage = error.message;
      letters = [];
      loading = false;
      return;
    }

    letters = (data ?? []) as Letter[];

    await loadPhotosForLetters(letters.map((letter) => letter.id));

    loading = false;
  }

  async function loadPhotosForLetters(letterIds: string[]) {
    if (letterIds.length === 0) {
      letterPhotos = {};
      return;
    }

    const { data, error } = await supabase
      .from('letter_photos')
      .select('letter_id, storage_path')
      .in('letter_id', letterIds);

    if (error) {
      console.error(error.message);
      photoErrorMessage = error.message;
      letterPhotos = {};
      return;
    }

    const rows = (data ?? []) as LetterPhotoRow[];

    const photos = await Promise.all(
      rows.map(async (row) => {
        const { data: signedData, error: signedError } = await supabase.storage
          .from('letter-photos')
          .createSignedUrl(row.storage_path, 60 * 60);

        if (signedError) {
          console.error(signedError.message);
        }

        const publicUrl = supabase.storage
          .from('letter-photos')
          .getPublicUrl(row.storage_path).data.publicUrl;

        return {
          letter_id: row.letter_id,
          storage_path: row.storage_path,
          signedUrl: signedData?.signedUrl ?? publicUrl ?? null
        };
      })
    );

    const grouped: Record<string, LetterPhoto[]> = {};

    for (const photo of photos) {
      grouped[photo.letter_id] ??= [];
      grouped[photo.letter_id].push(photo);
    }

    letterPhotos = grouped;
  }

  function normalizeText(value: unknown) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  function compareText(a: unknown, b: unknown) {
    return String(a ?? '').localeCompare(String(b ?? ''), 'cs-CZ', {
      sensitivity: 'base'
    });
  }

  function uniqueOptions(values: Array<string | null | undefined>) {
    return Array.from(
      new Set(
        values
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ).sort((a, b) =>
      a.localeCompare(b, 'cs-CZ', {
        sensitivity: 'base'
      })
    );
  }

  function getOwnerName(letter: Letter) {
    return (
      letter.owner_full_name ||
      letter.owner_name ||
      [letter.owner_first_name, letter.owner_last_name].filter(Boolean).join(' ') ||
      ''
    );
  }

  function getStatusLabel(status: string | null) {
    const value = status || 'saved';

    return statusOptions.find((option) => option.value === value)?.label ?? value;
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString('cs-CZ');
  }

  function formatNumber(value: number | null) {
    if (value === null || value === undefined) return '—';

    return new Intl.NumberFormat('cs-CZ').format(value);
  }

  function getMapUrl(letter: Letter) {
    if (letter.lat === null || letter.lng === null) return null;

    return `https://www.google.com/maps?q=${letter.lat},${letter.lng}`;
  }

  function openExternalUrl(url: string | null) {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function openMap(letter: Letter) {
    openExternalUrl(getMapUrl(letter));
  }

  function getPhotosForLetter(letter: Letter) {
    return letterPhotos[letter.id] ?? [];
  }

  function resetFilters() {
    search = '';
    selectedCity = 'all';
    selectedRegion = 'all';
    selectedDistrict = 'all';
    selectedCadastralArea = 'all';
    selectedStatus = 'all';
    selectedVerified = 'all';
    sortBy = 'newest';
  }

  async function updateStatus(letter: Letter, status: string) {
    updatingId = letter.id;

    const { error } = await supabase
      .from('letters')
      .update({ status })
      .eq('id', letter.id);

    if (error) {
      console.error(error.message);
      alert(error.message);
    } else {
      letters = letters.map((item) =>
        item.id === letter.id ? { ...item, status } : item
      );
    }

    updatingId = null;
  }

  async function deleteLetter(letter: Letter) {
    const confirmed = confirm(
      `Opravdu chceš smazat dopis pro adresu „${letter.property_address}“?`
    );

    if (!confirmed) return;

    deletingId = letter.id;

    const { error } = await supabase.from('letters').delete().eq('id', letter.id);

    if (error) {
      console.error(error.message);
      alert(error.message);
    } else {
      letters = letters.filter((item) => item.id !== letter.id);

      const nextLetterPhotos = { ...letterPhotos };
      delete nextLetterPhotos[letter.id];
      letterPhotos = nextLetterPhotos;
    }

    deletingId = null;
  }

  function exportCsv() {
    const emptyRow = {
      datum: '',
      status: '',
      vlastnik: '',
      adresa_nemovitosti: '',
      obec: '',
      kraj: '',
      okres: '',
      cast_obce: '',
      katastralni_uzemi: '',
      kod_katastru: '',
      typ: '',
      lv: '',
      parcela: '',
      cislo_stavby: '',
      vymera_m2: '',
      druh_pozemku: '',
      zpusob_vyuziti: '',
      cuzk_overeno: '',
      pocet_fotek: '',
      gps_lat: '',
      gps_lng: ''
    };

    const rows = filteredLetters.map((letter) => ({
      datum: formatDate(letter.created_at),
      status: getStatusLabel(letter.status),
      vlastnik: getOwnerName(letter),
      adresa_nemovitosti: letter.property_address,
      obec: letter.property_city ?? '',
      kraj: letter.property_region ?? '',
      okres: letter.property_district ?? '',
      cast_obce: letter.property_part ?? '',
      katastralni_uzemi: letter.cadastral_area ?? '',
      kod_katastru: letter.cadastral_area_code ?? '',
      typ: letter.property_type ?? '',
      lv: letter.lv_number ?? '',
      parcela: letter.parcel_number ?? '',
      cislo_stavby: letter.building_numbers ?? '',
      vymera_m2: letter.land_area_m2 ?? '',
      druh_pozemku: letter.land_type ?? '',
      zpusob_vyuziti: letter.usage_type ?? '',
      cuzk_overeno: letter.cuzk_verified ? 'ano' : 'ne',
      pocet_fotek: getPhotosForLetter(letter).length,
      gps_lat: letter.lat ?? '',
      gps_lng: letter.lng ?? ''
    }));

    const headers = Object.keys(rows[0] ?? emptyRow);

    const csv = [
      headers.join(';'),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = row[header as keyof typeof row] ?? '';

            return `"${String(value).replaceAll('"', '""')}"`;
          })
          .join(';')
      )
    ].join('\n');

    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `databaze-dopisu-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }
</script>

<div class="min-h-screen bg-slate-100 p-4">
  <div class="mx-auto max-w-6xl">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <a href={resolve('/')} class="text-sm text-slate-500">← Zpět</a>

      <a
        href={resolve('/pridat-dopis')}
        class="rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white"
      >
        + Přidat dopis
      </a>
    </div>

    <div class="mt-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Databáze</h1>
        <p class="mt-1 text-slate-500">
          Přehled uložených dopisů, nemovitostí, ČÚZK dat a fotografií.
        </p>
      </div>

      <button
        type="button"
        class="rounded-2xl bg-white px-4 py-3 text-sm font-semibold shadow disabled:opacity-40"
        onclick={exportCsv}
        disabled={filteredLetters.length === 0}
      >
        Export CSV
      </button>
    </div>

    {#if errorMessage}
      <div class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <strong>Chyba načítání:</strong> {errorMessage}
      </div>
    {/if}

    {#if photoErrorMessage}
      <div class="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Fotky se nepodařilo načíst:</strong> {photoErrorMessage}
      </div>
    {/if}

    <div class="mt-6 grid gap-3 md:grid-cols-5">
      <div class="rounded-3xl bg-white p-5 shadow">
        <div class="text-sm text-slate-500">Celkem dopisů</div>
        <div class="mt-2 text-3xl font-bold">{letters.length}</div>
      </div>

      <div class="rounded-3xl bg-white p-5 shadow">
        <div class="text-sm text-slate-500">Zobrazeno</div>
        <div class="mt-2 text-3xl font-bold">{filteredLetters.length}</div>
      </div>

      <div class="rounded-3xl bg-white p-5 shadow">
        <div class="text-sm text-slate-500">ČÚZK ověřeno</div>
        <div class="mt-2 text-3xl font-bold">{totalVerified}</div>
      </div>

      <div class="rounded-3xl bg-white p-5 shadow">
        <div class="text-sm text-slate-500">Měst / obcí</div>
        <div class="mt-2 text-3xl font-bold">{totalCities}</div>
      </div>

      <div class="rounded-3xl bg-white p-5 shadow">
        <div class="text-sm text-slate-500">Fotografií</div>
        <div class="mt-2 text-3xl font-bold">{totalPhotos}</div>
      </div>
    </div>

    <section class="mt-6 rounded-3xl bg-white p-5 shadow">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-semibold">Filtry a hledání</h2>

        <button
          type="button"
          class="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold"
          onclick={resetFilters}
        >
          Vymazat filtry
        </button>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-3">
        <label class="block md:col-span-3">
          <span class="text-sm font-medium">Hledat</span>
          <input
            bind:value={search}
            placeholder="Vlastník, adresa, město, parcela, LV, katastr…"
            class="mt-1 w-full rounded-2xl border p-3"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">Město / obec</span>
          <select bind:value={selectedCity} class="mt-1 w-full rounded-2xl border p-3">
            <option value="all">Všechna města</option>
            {#each cityOptions as city (city)}
              <option value={city}>{city}</option>
            {/each}
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Kraj</span>
          <select bind:value={selectedRegion} class="mt-1 w-full rounded-2xl border p-3">
            <option value="all">Všechny kraje</option>
            {#each regionOptions as region (region)}
              <option value={region}>{region}</option>
            {/each}
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Okres</span>
          <select bind:value={selectedDistrict} class="mt-1 w-full rounded-2xl border p-3">
            <option value="all">Všechny okresy</option>
            {#each districtOptions as district (district)}
              <option value={district}>{district}</option>
            {/each}
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Katastrální území</span>
          <select
            bind:value={selectedCadastralArea}
            class="mt-1 w-full rounded-2xl border p-3"
          >
            <option value="all">Všechna katastrální území</option>
            {#each cadastralAreaOptions as cadastralArea (cadastralArea)}
              <option value={cadastralArea}>{cadastralArea}</option>
            {/each}
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Status</span>
          <select bind:value={selectedStatus} class="mt-1 w-full rounded-2xl border p-3">
            <option value="all">Všechny statusy</option>
            {#each statusOptions as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">ČÚZK ověření</span>
          <select
            bind:value={selectedVerified}
            class="mt-1 w-full rounded-2xl border p-3"
          >
            <option value="all">Vše</option>
            <option value="yes">Pouze ověřené</option>
            <option value="no">Pouze neověřené</option>
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">Řazení</span>
          <select bind:value={sortBy} class="mt-1 w-full rounded-2xl border p-3">
            <option value="newest">Nejnovější první</option>
            <option value="oldest">Nejstarší první</option>
            <option value="city">Podle města</option>
            <option value="region">Podle kraje</option>
            <option value="owner">Podle vlastníka</option>
            <option value="cadastral">Podle katastru</option>
            <option value="status">Podle statusu</option>
          </select>
        </label>
      </div>
    </section>

    {#if loading}
      <p class="mt-6 text-slate-500">Načítám…</p>
    {:else if letters.length === 0}
      <p class="mt-6 rounded-2xl bg-white p-5 text-slate-600 shadow">
        Zatím nemáš žádný uložený dopis.
      </p>
    {:else if filteredLetters.length === 0}
      <p class="mt-6 rounded-2xl bg-white p-5 text-slate-600 shadow">
        Žádný dopis neodpovídá vybraným filtrům.
      </p>
    {:else}
      <div class="mt-6 space-y-4">
        {#each filteredLetters as letter (letter.id)}
          {@const photos = getPhotosForLetter(letter)}

          <article class="overflow-hidden rounded-3xl bg-white shadow">
            <div class="border-b p-5">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {getStatusLabel(letter.status)}
                    </span>

                    {#if letter.cuzk_verified}
                      <span class="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                        ČÚZK ověřeno
                      </span>
                    {:else}
                      <span class="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        ČÚZK neověřeno
                      </span>
                    {/if}

                    {#if letter.property_type}
                      <span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        {letter.property_type}
                      </span>
                    {/if}

                    {#if photos.length > 0}
                      <span class="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                        {photos.length} fotek
                      </span>
                    {/if}
                  </div>

                  <div class="mt-3 text-sm text-slate-500">
                    {formatDate(letter.created_at)}
                  </div>

                  <h2 class="mt-2 wrap-break-word text-xl font-bold">
                    {letter.property_address}
                  </h2>

                  <p class="mt-1 text-slate-600">
                    {getOwnerName(letter) || 'Bez jména vlastníka'}
                  </p>
                </div>

                <div class="flex flex-wrap gap-2">
                  {#if getMapUrl(letter)}
                    <button
                      type="button"
                      class="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold"
                      onclick={() => openMap(letter)}
                    >
                      Mapa
                    </button>
                  {/if}

                  <button
                    type="button"
                    class="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-40"
                    onclick={() => deleteLetter(letter)}
                    disabled={deletingId === letter.id}
                  >
                    {deletingId === letter.id ? 'Mažu…' : 'Smazat'}
                  </button>
                </div>
              </div>
            </div>

            {#if photos.length > 0}
              <div class="border-b bg-slate-50 p-5">
                <h3 class="font-semibold">Fotografie</h3>

                <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                  {#each photos as photo (photo.storage_path)}
                    <button
                      type="button"
                      class="overflow-hidden rounded-2xl bg-white shadow"
                      onclick={() => openExternalUrl(photo.signedUrl)}
                    >
                      {#if photo.signedUrl}
                        <img
                          src={photo.signedUrl}
                          alt="Fotografie nemovitosti"
                          class="aspect-square w-full object-cover"
                          loading="lazy"
                        />
                      {:else}
                        <div class="flex aspect-square items-center justify-center p-3 text-center text-xs text-slate-500">
                          Fotku se nepodařilo načíst
                        </div>
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="grid gap-4 p-5 lg:grid-cols-3">
              <section class="rounded-2xl bg-slate-50 p-4">
                <h3 class="font-semibold">Nemovitost</h3>

                <div class="mt-3 space-y-2 text-sm">
                  <div><strong>Město / obec:</strong> {letter.property_city ?? '—'}</div>
                  <div><strong>Kraj:</strong> {letter.property_region ?? '—'}</div>
                  <div><strong>Okres:</strong> {letter.property_district ?? '—'}</div>
                  <div><strong>Část obce:</strong> {letter.property_part ?? '—'}</div>
                  <div><strong>Katastr:</strong> {letter.cadastral_area ?? '—'}</div>
                  <div><strong>Kód katastru:</strong> {letter.cadastral_area_code ?? '—'}</div>
                </div>
              </section>

              <section class="rounded-2xl bg-slate-50 p-4">
                <h3 class="font-semibold">ČÚZK údaje</h3>

                <div class="mt-3 space-y-2 text-sm">
                  <div><strong>LV:</strong> {letter.lv_number ?? '—'}</div>
                  <div><strong>Parcela:</strong> {letter.parcel_number ?? '—'}</div>
                  <div><strong>Číslo stavby:</strong> {letter.building_numbers ?? '—'}</div>
                  <div><strong>Výměra:</strong> {formatNumber(letter.land_area_m2)} m²</div>
                  <div><strong>Druh pozemku:</strong> {letter.land_type ?? '—'}</div>
                  <div><strong>Využití:</strong> {letter.usage_type ?? '—'}</div>
                </div>
              </section>

              <section class="rounded-2xl bg-slate-50 p-4">
                <h3 class="font-semibold">Správa</h3>

                <label class="mt-3 block">
                  <span class="text-sm font-medium">Status dopisu</span>
                  <select
                    value={letter.status || 'saved'}
                    onchange={(event) => {
                      const target = event.target as HTMLSelectElement;
                      void updateStatus(letter, target.value);
                    }}
                    disabled={updatingId === letter.id}
                    class="mt-1 w-full rounded-2xl border bg-white p-3"
                  >
                    {#each statusOptions as option (option.value)}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                </label>

                <div class="mt-3 text-sm text-slate-600">
                  <div><strong>Zdroj ČÚZK:</strong> {letter.cuzk_source ?? '—'}</div>
                  <div><strong>Zpráva:</strong> {letter.cuzk_message ?? '—'}</div>
                </div>
              </section>
            </div>

            <div class="border-t p-5">
              <details>
                <summary class="cursor-pointer font-medium">Zobrazit adresáta</summary>

                <div class="mt-3 rounded-2xl bg-slate-50 p-4 text-sm">
                  <div><strong>Jméno:</strong> {getOwnerName(letter) || '—'}</div>
                  <div><strong>Oslovení:</strong> {letter.salutation ?? '—'}</div>
                  <div><strong>Adresa:</strong> {letter.owner_address ?? '—'}</div>
                  <div><strong>Město:</strong> {letter.owner_city ?? '—'}</div>
                  <div><strong>PSČ:</strong> {letter.owner_postal_code ?? '—'}</div>
                </div>
              </details>

              <details class="mt-4">
                <summary class="cursor-pointer font-medium">Zobrazit dopis</summary>

                <pre class="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-100 p-4 text-sm leading-relaxed">{letter.letter_text}</pre>
              </details>
            </div>
          </article>
        {/each}
      </div>
    {/if}

    {#if !loading && letters.length > 0}
      <div class="mt-6 rounded-2xl bg-white p-4 text-sm text-slate-500 shadow">
        Neověřené záznamy: {totalUnverified}. Záznamy můžeš filtrovat, exportovat do CSV,
        měnit jim status nebo je mazat.
      </div>
    {/if}
  </div>
</div>