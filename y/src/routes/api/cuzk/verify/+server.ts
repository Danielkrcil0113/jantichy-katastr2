import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import proj4 from 'proj4';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

type CuzkMode = 'gps' | 'adresni-misto' | 'stavba' | 'parcela';

type VerifyRequestBody = {
  mode?: CuzkMode;

  address?: string;
  lat?: number | null;
  lng?: number | null;
  radiusMeters?: number | string | null;

  kodAdresnihoMista?: number | string | null;

  kodCastiObce?: number | string | null;
  typStavby?: number | string | null;
  cisloDomovni?: number | string | null;

  kodKatastralnihoUzemi?: number | string | null;
  typParcely?: string | null;
  druhCislovaniParcely?: number | string | null;
  kmenoveCisloParcely?: number | string | null;
  poddeleniCislaParcely?: number | string | null;
  puvodParcelyZe?: number | string | null;
};

type CuzkCallResult = {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  data: JsonValue | null;
  errorText: string | null;
};

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

type SjtskPoint = {
  east: number;
  north: number;
};

const DEFAULT_RADIUS_METERS = 12;

proj4.defs(
  'EPSG:5514',
  '+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813975277778 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,480,0,0,0,0 +units=m +no_defs +type=crs'
);

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string) {
  return key
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findFirstValue(source: JsonValue | null, aliases: string[]): JsonValue | null {
  if (source === null) return null;

  const normalizedAliases = new Set(aliases.map((alias) => normalizeKey(alias)));

  function walk(value: JsonValue): JsonValue | null {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item);
        if (found !== null) return found;
      }

      return null;
    }

    if (isJsonObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (normalizedAliases.has(normalizeKey(key))) {
          return child;
        }
      }

      for (const child of Object.values(value)) {
        const found = walk(child);
        if (found !== null) return found;
      }
    }

    return null;
  }

  return walk(source);
}

function valueToString(value: JsonValue | null): string | null {
  if (value === null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (isJsonObject(value)) {
    const direct =
      value.nazev ??
      value.name ??
      value.text ??
      value.hodnota ??
      value.kod ??
      null;

    return valueToString(direct);
  }

  return null;
}

function valueToNumber(value: JsonValue | null): number | null {
  if (value === null) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function findString(source: JsonValue | null, aliases: string[]) {
  return valueToString(findFirstValue(source, aliases));
}

function findNumber(source: JsonValue | null, aliases: string[]) {
  return valueToNumber(findFirstValue(source, aliases));
}

function readPositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(String(value).trim());

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function readOptionalPositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  return readPositiveInteger(value);
}

function readPositiveNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined || String(value).trim() === '') {
    return fallback;
  }

  const parsed = Number(String(value).trim());

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseJsonOrText(text: string): JsonValue | null {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

function getCuzkConfig() {
  const baseUrl = env.CUZK_API_BASE_URL?.trim();
  const apiKey = env.CUZK_API_KEY?.trim();

  return {
    baseUrl,
    apiKey,
    ready: Boolean(baseUrl && apiKey)
  };
}

function messageFromCuzkStatus(status: number) {
  if (status === 200) return 'Nemovitost byla nalezena.';
  if (status === 400) return 'ČÚZK dotaz má špatné nebo neúplné parametry.';
  if (status === 401) return 'ČÚZK API klíč není platný nebo chybí.';
  if (status === 403) return 'ČÚZK API klíč nemá oprávnění pro tento dotaz.';
  if (status === 404) return 'ČÚZK nenašel odpovídající nemovitost.';
  if (status === 429) return 'ČÚZK API hlásí příliš mnoho požadavků.';

  return 'ČÚZK API nevrátilo úspěšnou odpověď.';
}

async function callCuzk(
  fetcher: typeof fetch,
  path: string,
  params: Record<string, string | number | null | undefined> = {}
): Promise<CuzkCallResult> {
  const { baseUrl, apiKey, ready } = getCuzkConfig();

  if (!ready || !baseUrl || !apiKey) {
    return {
      ok: false,
      status: 0,
      statusText: 'Missing configuration',
      url: path,
      data: null,
      errorText: 'Chybí CUZK_API_BASE_URL nebo CUZK_API_KEY v .env.'
    };
  }

  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetcher(url, {
    method: 'GET',
    headers: {
      ApiKey: apiKey,
      Accept: 'application/json'
    }
  });

  const responseText = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: url.toString(),
    data: parseJsonOrText(responseText),
    errorText: response.ok ? null : responseText
  };
}

function gpsToSjtsk(lat: number, lng: number): SjtskPoint {
  const result = proj4('EPSG:4326', 'EPSG:5514', [lng, lat]) as [number, number];

  return {
    east: result[0],
    north: result[1]
  };
}

function createSjtskSquare(point: SjtskPoint, radiusMeters: number) {
  const east = point.east;
  const north = point.north;

  return [
    {
      y: Number((north - radiusMeters).toFixed(2)),
      x: Number((east - radiusMeters).toFixed(2))
    },
    {
      y: Number((north - radiusMeters).toFixed(2)),
      x: Number((east + radiusMeters).toFixed(2))
    },
    {
      y: Number((north + radiusMeters).toFixed(2)),
      x: Number((east + radiusMeters).toFixed(2))
    },
    {
      y: Number((north + radiusMeters).toFixed(2)),
      x: Number((east - radiusMeters).toFixed(2))
    },
    {
      y: Number((north - radiusMeters).toFixed(2)),
      x: Number((east - radiusMeters).toFixed(2))
    }
  ];
}

function normalizeCuzkData(
  primaryData: JsonValue | null,
  propertyType: string | null
): CuzkNormalized {
  const cadastralAreaCode = findNumber(primaryData, [
    'kodKatastralnihoUzemi',
    'kodKu',
    'kuKod',
    'katastralniUzemiKod'
  ]);

  const lvNumber = findNumber(primaryData, [
    'cisloLV',
    'cisloLv',
    'lv',
    'listVlastnictvi',
    'cisloListuVlastnictvi'
  ]);

  const parcelRoot = findString(primaryData, [
    'parcelniCislo',
    'cisloParcely',
    'kmenoveCisloParcely'
  ]);

  const parcelSub = findString(primaryData, [
    'poddeleniCislaParcely',
    'poddeleni',
    'podlomeni'
  ]);

  const parcelNumber = parcelRoot && parcelSub ? `${parcelRoot}/${parcelSub}` : parcelRoot;

  const buildingNumber =
    findString(primaryData, ['cisloDomovni']) ??
    findString(primaryData, ['cisloPopisne']) ??
    findString(primaryData, ['cisloEvidencni']);

  return {
    property_type: propertyType,

    iskn_property_id: findString(primaryData, [
      'idStavby',
      'idParcely',
      'idJednotky',
      'isknId',
      'idNemovitosti',
      'id'
    ]),

    lv_number: lvNumber,
    parcel_number: parcelNumber,
    building_numbers: buildingNumber,

    property_city: findString(primaryData, [
      'nazevObce',
      'obecNazev',
      'obec',
      'mesto',
      'nazevMesta'
    ]),

    property_region: findString(primaryData, [
      'nazevKraje',
      'krajNazev',
      'kraj'
    ]),

    property_district: findString(primaryData, [
      'nazevOkresu',
      'okresNazev',
      'okres'
    ]),

    property_municipality: findString(primaryData, [
      'nazevObce',
      'obecNazev',
      'obec'
    ]),

    property_part: findString(primaryData, [
      'nazevCastiObce',
      'castObceNazev',
      'castObce',
      'castObce'
    ]),

    cadastral_area: findString(primaryData, [
      'nazevKatastralnihoUzemi',
      'katastralniUzemiNazev',
      'katastralniUzemi',
      'kuNazev'
    ]),

    cadastral_area_code: cadastralAreaCode,

    land_area_m2: findNumber(primaryData, [
      'vymera',
      'vymeraParcely',
      'vymeraPozemku',
      'vyměra'
    ]),

    land_type: findString(primaryData, [
      'druhPozemku',
      'nazevDruhuPozemku',
      'druhPozemkuNazev'
    ]),

    usage_type: findString(primaryData, [
      'zpusobVyuziti',
      'nazevZpusobuVyuziti',
      'zpusobVyuzitiNazev',
      'vyuziti'
    ])
  };
}

export const GET: RequestHandler = async ({ fetch }) => {
  const health = await callCuzk(fetch, '/api/v1/AplikacniSluzby/Health');
  const aktualnostDat = await callCuzk(fetch, '/api/v1/AplikacniSluzby/AktualnostDat');

  return json({
    ok: health.ok || aktualnostDat.ok,
    message: 'ČÚZK verify endpoint běží.',
    configReady: getCuzkConfig().ready,
    health,
    aktualnostDat
  });
};

export const POST: RequestHandler = async ({ request, fetch }) => {
  const body = (await request.json()) as VerifyRequestBody;

  const address = body.address?.trim() ?? '';
  const mode: CuzkMode = body.mode ?? 'gps';

  if (!getCuzkConfig().ready) {
    return json({
      ok: false,
      verified: false,
      mode,
      address,
      message: 'Chybí CUZK_API_BASE_URL nebo CUZK_API_KEY v .env.',
      normalized: normalizeCuzkData(null, null)
    });
  }

  try {
    if (mode === 'gps') {
      if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
        return json({
          ok: false,
          verified: false,
          mode,
          address,
          message: 'Pro GPS dotaz chybí lat nebo lng.',
          normalized: normalizeCuzkData(null, null)
        });
      }

      const radiusMeters = readPositiveNumber(body.radiusMeters, DEFAULT_RADIUS_METERS);
      const sjtskPoint = gpsToSjtsk(body.lat, body.lng);
      const polygon = createSjtskSquare(sjtskPoint, radiusMeters);
      const polygonString = JSON.stringify(polygon);

      const [stavby, parcely] = await Promise.all([
        callCuzk(fetch, '/api/v1/Stavby/Polygon', {
          SeznamSouradnic: polygonString
        }),
        callCuzk(fetch, '/api/v1/Parcely/Polygon', {
          SeznamSouradnic: polygonString
        })
      ]);

      const verified = stavby.ok || parcely.ok;
      const propertyType = stavby.ok ? 'stavba' : parcely.ok ? 'parcela' : null;
      const primaryData = stavby.ok ? stavby.data : parcely.ok ? parcely.data : null;

      return json({
        ok: verified,
        verified,
        mode,
        address,
        lat: body.lat,
        lng: body.lng,
        radiusMeters,
        sjtskPoint,
        polygon,
        message: verified
          ? 'ČÚZK našel nemovitost podle GPS polygonu.'
          : 'ČÚZK podle GPS polygonu nic nenašel.',
        normalized: normalizeCuzkData(primaryData, propertyType),
        results: {
          stavby,
          parcely
        }
      });
    }

    if (mode === 'adresni-misto') {
      const kodAdresnihoMista = readPositiveInteger(body.kodAdresnihoMista);

      if (!kodAdresnihoMista) {
        return json({
          ok: false,
          verified: false,
          mode,
          address,
          message: 'Zadej platný kód adresního místa RÚIAN.',
          normalized: normalizeCuzkData(null, null)
        });
      }

      const stavba = await callCuzk(
        fetch,
        `/api/v1/Stavby/AdresniMisto/${kodAdresnihoMista}`
      );

      return json({
        ok: stavba.ok,
        verified: stavba.ok,
        mode,
        address,
        message: messageFromCuzkStatus(stavba.status),
        normalized: normalizeCuzkData(stavba.ok ? stavba.data : null, 'stavba'),
        request: {
          kodAdresnihoMista
        },
        results: {
          stavba
        }
      });
    }

    if (mode === 'stavba') {
      const kodCastiObce = readPositiveInteger(body.kodCastiObce);
      const typStavby = readPositiveInteger(body.typStavby);
      const cisloDomovni = readPositiveInteger(body.cisloDomovni);

      if (!kodCastiObce || !typStavby || !cisloDomovni) {
        return json({
          ok: false,
          verified: false,
          mode,
          address,
          message:
            'Pro dotaz na stavbu zadej kód části obce, typ stavby a číslo domovní.',
          normalized: normalizeCuzkData(null, null)
        });
      }

      const stavby = await callCuzk(fetch, '/api/v1/Stavby/Vyhledani', {
        KodCastiObce: kodCastiObce,
        TypStavby: typStavby,
        CisloDomovni: cisloDomovni
      });

      return json({
        ok: stavby.ok,
        verified: stavby.ok,
        mode,
        address,
        message: messageFromCuzkStatus(stavby.status),
        normalized: normalizeCuzkData(stavby.ok ? stavby.data : null, 'stavba'),
        request: {
          kodCastiObce,
          typStavby,
          cisloDomovni
        },
        results: {
          stavby
        }
      });
    }

    if (mode === 'parcela') {
      const kodKatastralnihoUzemi = readPositiveInteger(body.kodKatastralnihoUzemi);
      const typParcely = body.typParcely?.trim() || 'PKN';
      const druhCislovaniParcely = readPositiveInteger(body.druhCislovaniParcely);
      const kmenoveCisloParcely = readPositiveInteger(body.kmenoveCisloParcely);
      const poddeleniCislaParcely = readOptionalPositiveInteger(
        body.poddeleniCislaParcely
      );
      const puvodParcelyZe = readOptionalPositiveInteger(body.puvodParcelyZe);

      if (
        !kodKatastralnihoUzemi ||
        !typParcely ||
        !druhCislovaniParcely ||
        !kmenoveCisloParcely
      ) {
        return json({
          ok: false,
          verified: false,
          mode,
          address,
          message:
            'Pro dotaz na parcelu zadej kód katastrálního území, typ parcely, druh číslování a kmenové číslo parcely.',
          normalized: normalizeCuzkData(null, null)
        });
      }

      const parcely = await callCuzk(fetch, '/api/v1/Parcely/Vyhledani', {
        KodKatastralnihoUzemi: kodKatastralnihoUzemi,
        TypParcely: typParcely,
        DruhCislovaniParcely: druhCislovaniParcely,
        KmenoveCisloParcely: kmenoveCisloParcely,
        PoddeleniCislaParcely: poddeleniCislaParcely,
        PuvodParcelyZE: puvodParcelyZe
      });

      return json({
        ok: parcely.ok,
        verified: parcely.ok,
        mode,
        address,
        message: messageFromCuzkStatus(parcely.status),
        normalized: normalizeCuzkData(parcely.ok ? parcely.data : null, 'parcela'),
        request: {
          kodKatastralnihoUzemi,
          typParcely,
          druhCislovaniParcely,
          kmenoveCisloParcely,
          poddeleniCislaParcely,
          puvodParcelyZe
        },
        results: {
          parcely
        }
      });
    }

    return json({
      ok: false,
      verified: false,
      mode,
      address,
      message: 'Neznámý typ ČÚZK dotazu.',
      normalized: normalizeCuzkData(null, null)
    });
  } catch (error) {
    console.error('ČÚZK verify chyba:', error);

    return json({
      ok: false,
      verified: false,
      mode,
      address,
      message: 'Nastala chyba při komunikaci s ČÚZK API.',
      normalized: normalizeCuzkData(null, null)
    });
  }
};