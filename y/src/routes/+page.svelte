<script lang="ts">
  import { resolve } from '$app/paths';
</script>

<div class="min-h-screen bg-slate-100 p-6">
  <h1 class="mb-8 text-3xl font-bold">Dopisy</h1>

  <div class="grid gap-4 sm:grid-cols-2">
    <a
      href={resolve('/databaze')}
      class="rounded-2xl bg-white p-8 shadow hover:shadow-lg"
    >
      <div class="text-5xl">📁</div>
      <div class="mt-4 text-xl font-semibold">Databáze</div>
      <p class="mt-2 text-slate-600">Uložené dopisy a nemovitosti</p>
    </a>

    <a
      href={resolve('/pridat-dopis')}
      class="rounded-2xl bg-white p-8 shadow hover:shadow-lg"
    >
      <div class="text-5xl">✉️</div>
      <div class="mt-4 text-xl font-semibold">Přidat dopis</div>
      <p class="mt-2 text-slate-600">Fotky, poloha, katastr a text dopisu</p>
    </a>
  </div>
</div>