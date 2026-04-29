<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { supabase } from '$lib/supabase';
  import { createLetterText } from '$lib/letter';
  import { getOrCreateUser } from '$lib/auth';

  type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

  type CuzkMode = 'gps' | 'adresni-misto' | 'stavba' | 'parcela';

  type CuzkNormalized = {
    property_type: string | null;
    iskn_property_id: string | null;
    lv_number: number | null;
    parcel_number: string | null;
    building_numbers: string | null;

    property_city: string | null;
    property_region: string | null;
    property_district: string | null;
    property_municipality: string | null;
    property_part: string | null;

    cadastral_area: string | null;
    cadastral_area_code: number | null;

    land_area_m2: number | null;
    land_type: string | null;
    usage_type: string | null;
  };

  type CuzkVerifyResponse = {
    ok: boolean;
    verified: boolean;
    mode: CuzkMode;
    address: string;
    message: string;
    normalized: CuzkNormalized;
    results?: JsonValue;
    request?: JsonValue;
    lat?: number | null;
    lng?: number | null;
  };

  type InsertedLetter = {
    id: string;
  };

  const emptyNormalized: CuzkNormalized = {
    property_type: null,
    iskn_property_id: null,
    lv_number: null,
    parcel_number: null,
    building_numbers: null,

    property_city: null,
    property_region: null,
    property_district: null,
    property_municipality: null,
    property_part: null,

    cadastral_area: null,
    cadastral_area_code: null,

    land_area_m2: null,
    land_type: null,
    usage_type: null
  };

  let step = $state(1);

  let photos = $state<File[]>([]);
  let previews = $state<string[]>([]);

  let lat = $state<number | null>(null);
  let lng = $state<number | null>(null);
  let address = $state('');

  let ownerFirstName = $state('');
  let ownerLastName = $state('');
  let ownerAddress = $state('');
  let ownerCity = $state('');
  let ownerPostalCode = $state('');

  let ownerFullName = $derived(
    [ownerFirstName.trim(), ownerLastName.trim()].filter(Boolean).join(' ')
  );

  let salutation = $state('Vážený pane');

  let cuzkMode = $state<CuzkMode>('gps');

  let kodAdresnihoMista = $state('');

  let kodCastiObce = $state('');
  let typStavby = $state('1');
  let cisloDomovni = $state('');

  let kodKatastralnihoUzemi = $state('');
  let typParcely = $state('PKN');
  let druhCislovaniParcely = $state('2');
  let kmenoveCisloParcely = $state('');
  let poddeleniCislaParcely = $state('');
  let puvodParcelyZe = $state('');

  let cadastralData = $state<CuzkVerifyResponse | null>(null);
  let verifying = $state(false);
  let saving = $state(false);

  let letterText = $state('');

  function handlePhotos(event: Event) {
    const input = event.target as HTMLInputElement;
    const selected = Array.from(input.files ?? []).slice(0, 5);

    for (const preview of previews) {
      URL.revokeObjectURL(preview);
    }

    photos = selected;
    previews = selected.map((file) => URL.createObjectURL(file));
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(previews[index]);

    photos = photos.filter((_, photoIndex) => photoIndex !== index);
    previews = previews.filter((_, previewIndex) => previewIndex !== index);
  }

  function getGps() {
    if (!navigator.geolocation) {
      alert('Tento prohlížeč nepodporuje GPS polohu.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        lat = position.coords.latitude;
        lng = position.coords.longitude;
        cuzkMode = 'gps';
      },
      () => {
        alert('Nepodařilo se získat GPS polohu.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  }

  function buildCuzkRequestBody() {
    return {
      mode: cuzkMode,
      address,
      lat,
      lng,

      kodAdresnihoMista,

      kodCastiObce,
      typStavby,
      cisloDomovni,

      kodKatastralnihoUzemi,
      typParcely,
      druhCislovaniParcely,
      kmenoveCisloParcely,
      poddeleniCislaParcely,
      puvodParcelyZe
    };
  }

  async function verifyProperty() {
    verifying = true;

    try {
      const response = await fetch(resolve('/api/cuzk/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCuzkRequestBody())
      });

      const data = (await response.json()) as CuzkVerifyResponse;
      cadastralData = data;

      if (!data.ok) {
        alert(data.message || 'ČÚZK nemovitost neověřil.');
        return;
      }

      letterText = createLetterText({
        salutation,
        ownerName: ownerFullName || '[doplnit jméno]',
        address
      });

      step = 4;
    } catch (error) {
      console.error(error);
      alert('Nastala chyba při ověřování nemovitosti.');
    } finally {
      verifying = false;
    }
  }

  async function saveLetter() {
    saving = true;

    try {
      const user = await getOrCreateUser();
      const normalized = cadastralData?.normalized ?? emptyNormalized;

      const { data: letterData, error: letterError } = await supabase
        .from('letters')
        .insert({
          user_id: user.id,

          owner_name: ownerFullName,
          owner_first_name: ownerFirstName || null,
          owner_last_name: ownerLastName || null,
          owner_full_name: ownerFullName || null,
          owner_address: ownerAddress || null,
          owner_city: ownerCity || null,
          owner_postal_code: ownerPostalCode || null,

          salutation,
          property_address: address,
          lat,
          lng,

          property_city: normalized.property_city,
          property_region: normalized.property_region,
          property_district: normalized.property_district,
          property_municipality: normalized.property_municipality,
          property_part: normalized.property_part,
          cadastral_area: normalized.cadastral_area,
          cadastral_area_code: normalized.cadastral_area_code,

          property_type: normalized.property_type,
          iskn_property_id: normalized.iskn_property_id,
          lv_number: normalized.lv_number,
          parcel_number: normalized.parcel_number,
          building_numbers: normalized.building_numbers,
          land_area_m2: normalized.land_area_m2,
          land_type: normalized.land_type,
          usage_type: normalized.usage_type,

          cuzk_verified: cadastralData?.verified ?? false,
          cuzk_source: cadastralData?.mode ?? null,
          cuzk_message: cadastralData?.message ?? null,
          cuzk_normalized: normalized,

          cadastral_data: cadastralData,
          letter_text: letterText,
          status: 'saved'
        })
        .select('id')
        .single();

      if (letterError || !letterData) {
        alert(letterError?.message ?? 'Dopis se nepodařilo uložit.');
        return;
      }

      const letter = letterData as InsertedLetter;

      for (const photo of photos) {
        const safeName = photo.name.replaceAll(/\s+/g, '-');
        const path = `${user.id}/${letter.id}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('letter-photos')
          .upload(path, photo);

        if (uploadError) {
          console.error(uploadError.message);
          continue;
        }

        const { error: photoInsertError } = await supabase.from('letter_photos').insert({
          user_id: user.id,
          letter_id: letter.id,
          storage_path: path
        });

        if (photoInsertError) {
          console.error(photoInsertError.message);
        }
      }

      await goto(resolve('/databaze'));
    } catch (error) {
      console.error(error);

      const message =
        error instanceof Error
          ? error.message
          : 'Nastala chyba při ukládání dopisu.';

      alert(message);
    } finally {
      saving = false;
    }
  }
</script>

<div class="min-h-screen bg-slate-100 p-4">
  <div class="mx-auto max-w-3xl rounded-3xl bg-white p-5 shadow">
    <a href={resolve('/')} class="text-sm text-slate-500">← Zpět</a>

    <div class="mt-4">
      <h1 class="text-2xl font-bold">Přidat dopis</h1>
      <p class="mt-1 text-slate-500">Krok {step} / 4</p>

      <div class="mt-4 h-2 rounded-full bg-slate-200">
        <div
          class="h-2 rounded-full bg-black transition-all"
          style={`width: ${(step / 4) * 100}%`}
        ></div>
      </div>
    </div>

    {#if step === 1}
      <div class="mt-6 space-y-4">
        <h2 class="text-xl font-semibold">1. Fotografie</h2>

        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onchange={handlePhotos}
          class="block w-full rounded-2xl border p-3"
        />

        <p class="text-sm text-slate-500">Maximálně 5 fotografií. Můžeš pokračovat i bez fotek.</p>

        <div class="grid grid-cols-3 gap-3">
          {#each previews as preview, index (preview)}
            <div class="relative">
              <img src={preview} alt="Náhled" class="aspect-square rounded-2xl object-cover" />

              <button
                type="button"
                class="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white"
                onclick={() => removePhoto(index)}
              >
                ×
              </button>
            </div>
          {/each}
        </div>

        <button
          class="w-full rounded-2xl bg-black p-4 font-semibold text-white"
          onclick={() => (step = 2)}
        >
          Další
        </button>
      </div>
    {/if}

    {#if step === 2}
      <div class="mt-6 space-y-4">
        <h2 class="text-xl font-semibold">2. Poloha a adresa nemovitosti</h2>

        <button
          class="w-full rounded-2xl bg-slate-900 p-4 font-semibold text-white"
          onclick={getGps}
        >
          Najít GPS polohu
        </button>

        {#if lat !== null && lng !== null}
          <p class="rounded-2xl bg-green-50 p-3 text-sm text-green-800">
            GPS uložena: {lat}, {lng}
          </p>
        {/if}

        <label class="block">
          <span class="text-sm font-medium">Adresa nemovitosti pro dopis</span>
          <input
            bind:value={address}
            placeholder="např. Ohrada 364, Všetaty"
            class="mt-1 w-full rounded-2xl border p-3"
          />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <button
            class="rounded-2xl bg-slate-200 p-4 font-semibold"
            onclick={() => (step = 1)}
          >
            Zpět
          </button>

          <button
            class="rounded-2xl bg-black p-4 font-semibold text-white disabled:opacity-40"
            onclick={() => (step = 3)}
            disabled={!address.trim()}
          >
            Další
          </button>
        </div>
      </div>
    {/if}

    {#if step === 3}
      <div class="mt-6 space-y-5">
        <h2 class="text-xl font-semibold">3. ČÚZK + vlastník</h2>

        <section class="rounded-3xl bg-slate-50 p-4">
          <h3 class="font-semibold">Ověření nemovitosti z ČÚZK</h3>

          <label class="mt-3 block">
            <span class="text-sm font-medium">Způsob ověření</span>
            <select bind:value={cuzkMode} class="mt-1 w-full rounded-2xl border p-3">
              <option value="gps">GPS poloha → polygon</option>
              <option value="adresni-misto">Kód adresního místa RÚIAN</option>
              <option value="stavba">Stavba podle části obce a čísla domovního</option>
              <option value="parcela">Parcela podle katastrálního území a čísla parcely</option>
            </select>
          </label>

          {#if cuzkMode === 'gps'}
            <div class="mt-4 rounded-2xl bg-white p-4">
              {#if lat !== null && lng !== null}
                <p class="text-sm text-slate-600">Použije se GPS: {lat}, {lng}</p>
              {:else}
                <p class="text-sm text-red-600">
                  Pro GPS dotaz se vrať na krok 2 a klikni na „Najít GPS polohu“.
                </p>
              {/if}
            </div>
          {/if}

          {#if cuzkMode === 'adresni-misto'}
            <label class="mt-4 block">
              <span class="text-sm font-medium">Kód adresního místa RÚIAN</span>
              <input
                bind:value={kodAdresnihoMista}
                placeholder="např. 25133616"
                inputmode="numeric"
                class="mt-1 w-full rounded-2xl border p-3"
              />
            </label>
          {/if}

          {#if cuzkMode === 'stavba'}
            <div class="mt-4 grid gap-3">
              <label class="block">
                <span class="text-sm font-medium">Kód části obce</span>
                <input
                  bind:value={kodCastiObce}
                  placeholder="např. 400611"
                  inputmode="numeric"
                  class="mt-1 w-full rounded-2xl border p-3"
                />
              </label>

              <label class="block">
                <span class="text-sm font-medium">Typ stavby</span>
                <select bind:value={typStavby} class="mt-1 w-full rounded-2xl border p-3">
                  <option value="1">1 — číslo popisné</option>
                  <option value="2">2 — číslo evidenční</option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-medium">Číslo domovní</span>
                <input
                  bind:value={cisloDomovni}
                  placeholder="např. 364"
                  inputmode="numeric"
                  class="mt-1 w-full rounded-2xl border p-3"
                />
              </label>
            </div>
          {/if}

          {#if cuzkMode === 'parcela'}
            <div class="mt-4 grid gap-3">
              <label class="block">
                <span class="text-sm font-medium">Kód katastrálního území</span>
                <input
                  bind:value={kodKatastralnihoUzemi}
                  placeholder="např. 730475"
                  inputmode="numeric"
                  class="mt-1 w-full rounded-2xl border p-3"
                />
              </label>

              <label class="block">
                <span class="text-sm font-medium">Typ parcely</span>
                <select bind:value={typParcely} class="mt-1 w-full rounded-2xl border p-3">
                  <option value="PKN">PKN — parcela KN</option>
                  <option value="PZE">PZE — parcela ZE</option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-medium">Druh číslování parcely</span>
                <input
                  bind:value={druhCislovaniParcely}
                  placeholder="např. 2"
                  inputmode="numeric"
                  class="mt-1 w-full rounded-2xl border p-3"
                />
              </label>

              <label class="block">
                <span class="text-sm font-medium">Kmenové číslo parcely</span>
                <input
                  bind:value={kmenoveCisloParcely}
                  placeholder="např. 605"
                  inputmode="numeric"
                  class="mt-1 w-full rounded-2xl border p-3"
                />
              </label>

              <label class="block">
                <span class="text-sm font-medium">Poddělení čísla parcely</span>
                <input
                  bind:value={poddeleniCislaParcely}
                  placeholder="volitelné"
                  inputmode="numeric"
                  class="mt-1 w-full rounded-2xl border p-3"
                />
              </label>

              <label class="block">
                <span class="text-sm font-medium">Původ parcely ZE</span>
                <input
                  bind:value={puvodParcelyZe}
                  placeholder="volitelné"
                  inputmode="numeric"
                  class="mt-1 w-full rounded-2xl border p-3"
                />
              </label>
            </div>
          {/if}

          <button
            class="mt-4 w-full rounded-2xl bg-black p-4 font-semibold text-white disabled:opacity-40"
            onclick={verifyProperty}
            disabled={verifying}
          >
            {verifying ? 'Ověřuji…' : 'Ověřit přes ČÚZK'}
          </button>

          {#if cadastralData}
            <div class="mt-4 rounded-2xl border bg-white p-4">
              <div class="font-semibold">
                Výsledek: {cadastralData.verified ? 'ověřeno' : 'neověřeno'}
              </div>

              <p class="mt-1 text-sm text-slate-600">{cadastralData.message}</p>

              <div class="mt-4 grid gap-2 text-sm">
                <div><strong>Typ:</strong> {cadastralData.normalized.property_type ?? '—'}</div>
                <div><strong>Město/obec:</strong> {cadastralData.normalized.property_city ?? '—'}</div>
                <div><strong>Kraj:</strong> {cadastralData.normalized.property_region ?? '—'}</div>
                <div><strong>Okres:</strong> {cadastralData.normalized.property_district ?? '—'}</div>
                <div><strong>Katastr:</strong> {cadastralData.normalized.cadastral_area ?? '—'}</div>
                <div><strong>LV:</strong> {cadastralData.normalized.lv_number ?? '—'}</div>
                <div><strong>Parcela:</strong> {cadastralData.normalized.parcel_number ?? '—'}</div>
                <div><strong>Číslo stavby:</strong> {cadastralData.normalized.building_numbers ?? '—'}</div>
              </div>

              <details class="mt-3">
                <summary class="cursor-pointer text-sm font-medium">Zobrazit celá technická data</summary>
                <pre class="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-100 p-3 text-xs">{JSON.stringify(cadastralData, null, 2)}</pre>
              </details>
            </div>
          {/if}
        </section>

        <section class="rounded-3xl bg-slate-50 p-4">
          <h3 class="font-semibold">Vlastník / adresát dopisu</h3>
          <p class="mt-1 text-sm text-slate-500">
            Tyto údaje se doplňují ručně. Uloží se do databáze a použijí se v dopise.
          </p>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="text-sm font-medium">Jméno</span>
              <input
                bind:value={ownerFirstName}
                placeholder="Jan"
                class="mt-1 w-full rounded-2xl border p-3"
              />
            </label>

            <label class="block">
              <span class="text-sm font-medium">Příjmení</span>
              <input
                bind:value={ownerLastName}
                placeholder="Novák"
                class="mt-1 w-full rounded-2xl border p-3"
              />
            </label>
          </div>

          <label class="mt-3 block">
            <span class="text-sm font-medium">Adresa vlastníka</span>
            <input
              bind:value={ownerAddress}
              placeholder="Ulice a číslo"
              class="mt-1 w-full rounded-2xl border p-3"
            />
          </label>

          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="text-sm font-medium">Město vlastníka</span>
              <input
                bind:value={ownerCity}
                placeholder="Město"
                class="mt-1 w-full rounded-2xl border p-3"
              />
            </label>

            <label class="block">
              <span class="text-sm font-medium">PSČ</span>
              <input
                bind:value={ownerPostalCode}
                placeholder="123 45"
                class="mt-1 w-full rounded-2xl border p-3"
              />
            </label>
          </div>

          <label class="mt-3 block">
            <span class="text-sm font-medium">Oslovení</span>
            <select bind:value={salutation} class="mt-1 w-full rounded-2xl border p-3">
              <option>Vážený pane</option>
              <option>Vážená paní</option>
              <option>Vážení</option>
            </select>
          </label>
        </section>

        <div class="grid grid-cols-2 gap-3">
          <button
            class="rounded-2xl bg-slate-200 p-4 font-semibold"
            onclick={() => (step = 2)}
          >
            Zpět
          </button>

          <button
            class="rounded-2xl bg-black p-4 font-semibold text-white disabled:opacity-40"
            onclick={() => {
              letterText = createLetterText({
                salutation,
                ownerName: ownerFullName || '[doplnit jméno]',
                address
              });

              step = 4;
            }}
            disabled={!address.trim()}
          >
            Pokračovat na dopis
          </button>
        </div>
      </div>
    {/if}

    {#if step === 4}
      <div class="mt-6 space-y-4">
        <h2 class="text-xl font-semibold">4. Upravit průvodní dopis</h2>

        <textarea
          bind:value={letterText}
          rows="22"
          class="w-full rounded-2xl border p-4 font-serif leading-relaxed"
        ></textarea>

        <div class="grid grid-cols-2 gap-3">
          <button
            class="rounded-2xl bg-slate-200 p-4 font-semibold"
            onclick={() => (step = 3)}
          >
            Zpět
          </button>

          <button
            class="rounded-2xl bg-black p-4 font-semibold text-white disabled:opacity-40"
            onclick={saveLetter}
            disabled={saving}
          >
            {saving ? 'Ukládám…' : 'Uložit do databáze'}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>