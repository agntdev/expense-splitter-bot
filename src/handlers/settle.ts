import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../store.js";

registerMainMenuItem({ label: "✅ Settle", data: "trip:settle", order: 60 });

const composer = new Composer<Ctx>();

composer.command("settle", async (ctx) => {
  await showDebtsToSettle(ctx);
});

composer.callbackQuery("trip:settle", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showDebtsToSettle(ctx);
});

async function showDebtsToSettle(ctx: Ctx) {
  const tripId = ctx.session.activeTripId;
  if (!tripId) {
    await ctx.reply("You don't have an active trip yet. Create one first!", {
      reply_markup: inlineKeyboard([[inlineButton("➕ Create trip", "trip:create")]]),
    });
    return;
  }

  const trip = store.getTrip(tripId);
  if (!trip) {
    await ctx.reply("Trip not found.");
    return;
  }

  const debts = store.getTripDebts(tripId);
  if (debts.length === 0) {
    const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
    await ctx.reply("All settled! No debts to pay.", { reply_markup: backToMenu });
    return;
  }

  const buttons = debts.map((d) => {
    const debtorLabel = d.debtorId === ctx.from?.id ? "You" : `User ${d.debtorId}`;
    const creditorLabel = d.creditorId === ctx.from?.id ? "You" : `User ${d.creditorId}`;
    return [
      inlineButton(
        `${debtorLabel} → ${creditorLabel}: ${trip.currency} ${d.amount.toFixed(2)}`,
        `trip:settle:${d.id}`,
      ),
    ];
  });

  buttons.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  await ctx.reply("Tap a debt to settle it:", { reply_markup: inlineKeyboard(buttons) });
}

composer.callbackQuery(/^trip:settle:debt_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const debtId = `debt_${ctx.match[1]}`;
  const tripId = ctx.session.activeTripId;

  if (!tripId) {
    await ctx.reply("No active trip.");
    return;
  }

  const trip = store.getTrip(tripId);
  if (!trip) {
    await ctx.reply("Trip not found.");
    return;
  }

  const allDebts = store.getTripDebts(tripId);
  const debt = allDebts.find((d) => d.id === debtId);
  if (!debt) {
    await ctx.reply("That debt doesn't exist or is already settled.");
    return;
  }

  const debtorLabel = debt.debtorId === ctx.from?.id ? "You" : `User ${debt.debtorId}`;
  const creditorLabel = debt.creditorId === ctx.from?.id ? "You" : `User ${debt.creditorId}`;

  ctx.session.flow = {
    settleDebtorId: debt.debtorId,
    settleCreditorId: debt.creditorId,
    settleAmount: debt.amount,
  };

  await ctx.reply(
    `Settle: ${debtorLabel} pays ${creditorLabel} ${trip.currency} ${debt.amount.toFixed(2)}?`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("✅ Yes, paid", `trip:settle:confirm:${debtId}`),
          inlineButton("❌ Cancel", "menu:main"),
        ],
      ]),
    },
  );
});

composer.callbackQuery(/^trip:settle:confirm:debt_(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const debtId = `debt_${ctx.match[1]}`;
  const tripId = ctx.session.activeTripId;

  if (!tripId) {
    await ctx.reply("No active trip.");
    return;
  }

  const trip = store.getTrip(tripId);
  if (!trip) {
    await ctx.reply("Trip not found.");
    return;
  }

  const success = store.settleDebt(debtId);
  if (!success) {
    await ctx.reply("That debt couldn't be settled — it may already be paid.");
    ctx.session.flow = {};
    return;
  }

  ctx.session.flow = {};
  const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
  await ctx.reply("✅ Debt settled! Updated balances:", { reply_markup: backToMenu });
});

export default composer;
