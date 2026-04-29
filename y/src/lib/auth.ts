import { supabase } from '$lib/supabase';

export async function getOrCreateUser() {
  const {
    data: { user },
    error: getUserError
  } = await supabase.auth.getUser();

  if (user) {
    return user;
  }

  if (getUserError) {
    console.warn('Supabase getUser error:', getUserError.message);
  }

  const {
    data: { user: anonymousUser },
    error: signInError
  } = await supabase.auth.signInAnonymously();

  if (signInError || !anonymousUser) {
    throw new Error(
      signInError?.message ??
        'Nepodařilo se vytvořit anonymního uživatele. Zkontroluj, že máš v Supabase zapnuté Anonymous Sign-Ins.'
    );
  }

  return anonymousUser;
}