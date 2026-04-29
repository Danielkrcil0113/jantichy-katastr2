type LetterInput = {
  salutation?: string;
  ownerName?: string;
  address: string;
};

export function createLetterText({
  salutation = 'Vážený pane',
  ownerName = '[doplnit jméno]',
  address
}: LetterInput) {
  return `${salutation} ${ownerName},

dovolte mi, abych Vás krátce oslovil v souvislosti s prodejem Vaší nemovitosti na adrese ${address}. Zaznamenal jsem, že je aktuálně nabízena k prodeji prostřednictvím realitní kanceláře.

Důvodem mého dopisu není zpochybňovat Vaše rozhodnutí ani spolupráci, kterou jste zvolili. Naopak respektuji, že jste již podnikli kroky k prodeji. Z praxe ale víme, že někdy se může stát, že prodej neprobíhá tak rychle nebo tak výhodně, jak si majitel původně představoval.

Rád bych Vám proto nabídl možnost nezávazné konzultace a představení našeho přístupu k prodeji nemovitostí.

Ve společnosti M&M reality holding a.s. se zaměřujeme na maximálně profesionální a komplexní servis pro majitele nemovitostí. Klientům zajišťujeme mimo jiné:

• detailní analýzu tržní ceny nemovitosti
• profesionální prezentaci a marketing nemovitosti
• aktivní vyhledávání kupujících z naší databáze poptávajících klientů
• kompletní právní servis a bezpečné vypořádání kupní ceny
• možnost rychlého výkupu nemovitosti

Každá nemovitost i situace majitele je specifická, a proto vždy hledáme řešení, které je pro klienta nejvýhodnější.

Pokud byste někdy měl pocit, že prodej Vaší nemovitosti neprobíhá podle Vašich očekávání, nebo byste chtěl znát i jiný pohled na možnosti jejího prodeje, budu rád, když se mi ozvete. Rád Vám vše nezávazně představím a společně můžeme probrat možnosti, které se dnes na trhu nabízejí.

Děkuji za Váš čas a přeji Vám úspěšný prodej Vaší nemovitosti.

S úctou

Jan Tichý
M&M reality
telefon: 775 76 20 20
e-mail: jtichy2@mmreality.cz

P.S.: I krátká nezávazná konzultace někdy přinese nový pohled na možnosti prodeje. Pokud byste měl zájem o srovnání přístupů nebo aktuální situace na trhu v této lokalitě, rád Vám tyto informace poskytnu.`;
}