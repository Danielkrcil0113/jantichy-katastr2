import { json, type RequestHandler } from '@sveltejs/kit';

type NominatimAddress = {
  road?: string;
  pedestrian?: string;
  footway?: string;
  path?: string;
  house_number?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  postcode?: string;
};

type NominatimResponse = {
  display_name?: string;
  address?: NominatimAddress;
};

export const GET: RequestHandler = async ({ url, fetch }) => {
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');

  if (!lat || !lng) {
    return json(
      {
        ok: false,
        message: 'Chybí lat nebo lng.'
      },
      { status: 400 }
    );
  }

  const reverseUrl = new URL('https://nominatim.openstreetmap.org/reverse');
  reverseUrl.searchParams.set('format', 'jsonv2');
  reverseUrl.searchParams.set('lat', lat);
  reverseUrl.searchParams.set('lon', lng);
  reverseUrl.searchParams.set('addressdetails', '1');
  reverseUrl.searchParams.set('accept-language', 'cs');

  try {
    const response = await fetch(reverseUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pridat-dopis-app/1.0'
      }
    });

    if (!response.ok) {
      return json(
        {
          ok: false,
          message: 'Adresu se nepodařilo načíst.'
        },
        { status: response.status }
      );
    }

    const data = (await response.json()) as NominatimResponse;
    const a = data.address ?? {};

    const road = a.road ?? a.pedestrian ?? a.footway ?? a.path ?? '';
    const houseNumber = a.house_number ?? '';
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? '';
    const postcode = a.postcode ?? '';

    const streetLine = [road, houseNumber].filter(Boolean).join(' ');
    const cityLine = [postcode, city].filter(Boolean).join(' ');

    const formattedAddress = [streetLine, cityLine].filter(Boolean).join(', ');

    return json({
      ok: true,
      address: formattedAddress || data.display_name || '',
      raw: data
    });
  } catch (error) {
    console.error('Reverse geocode chyba:', error);

    return json(
      {
        ok: false,
        message: 'Nastala chyba při načítání adresy z GPS.'
      },
      { status: 500 }
    );
  }
};