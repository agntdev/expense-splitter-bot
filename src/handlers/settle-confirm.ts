import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../store.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("settle:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
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
});

export default composer;
