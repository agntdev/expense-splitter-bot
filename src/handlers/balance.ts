import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../store.js";
import type { Debt } from "../store.js";

registerMainMenuItem({ label: "📊 Balance", data: "trip:balance", order: 40 });

const composer = new Composer<Ctx>();

composer.command("balance", async (ctx) => {
  await showBalance(ctx);
});

composer.callbackQuery("trip:balance", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showBalance(ctx);
});

async function showBalance(ctx: Ctx) {
  const tripId = ctx.session.activeTripId;
  if (!tripId) {
    await ctx.reply("You don't have an active trip yet. Create one first!", {
      reply_markup: inlineKeyboard([[inlineButton("➕ Create trip", "trip:create")]]),
    });
    return;
  }

  const trip = store.getTrip(tripId);
  if (!trip) {
    await ctx.reply("Trip not found. It may have been deleted.");
    return;
  }

  const debts = store.getTripDebts(tripId);
  if (debts.length === 0) {
    const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
    await ctx.reply("All settled! No debts in this trip.", { reply_markup: backToMenu });
    return;
  }

  const simplified = simplifyDebts(debts);

  const lines = simplified.map((d) => {
    const debtorLabel = d.debtorId === ctx.from?.id ? "You" : `User ${d.debtorId}`;
    const creditorLabel = d.creditorId === ctx.from?.id ? "You" : `User ${d.creditorId}`;
    return `• ${debtorLabel} owes ${creditorLabel} ${trip.currency} ${d.amount.toFixed(2)}`;
  });

  const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
  await ctx.reply(`📊 Who owes whom:\n\n${lines.join("\n")}`, { reply_markup: backToMenu });
}

function simplifyDebts(debts: Debt[]): { debtorId: number; creditorId: number; amount: number }[] {
  // Calculate net balances
  const balances = new Map<number, number>();
  for (const d of debts) {
    balances.set(d.debtorId, (balances.get(d.debtorId) ?? 0) - d.amount);
    balances.set(d.creditorId, (balances.get(d.creditorId) ?? 0) + d.amount);
  }

  // Separate into debtors (negative balance) and creditors (positive balance)
  const debtors: { id: number; amount: number }[] = [];
  const creditors: { id: number; amount: number }[] = [];

  for (const [id, balance] of balances) {
    if (balance < -0.01) debtors.push({ id, amount: -balance });
    else if (balance > 0.01) creditors.push({ id, amount: balance });
  }

  // Sort descending by amount
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  // Greedy simplification
  const result: { debtorId: number; creditorId: number; amount: number }[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const transfer = Math.min(d.amount, c.amount);

    if (transfer > 0.01) {
      result.push({ debtorId: d.id, creditorId: c.id, amount: Math.round(transfer * 100) / 100 });
    }

    d.amount -= transfer;
    c.amount -= transfer;

    if (d.amount < 0.01) i++;
    if (c.amount < 0.01) j++;
  }

  return result;
}

export default composer;
