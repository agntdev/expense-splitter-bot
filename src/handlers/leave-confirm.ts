import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../store.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("leave:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const tripId = ctx.session.activeTripId;
  const userId = ctx.from?.id;

  if (!tripId || !userId) {
    await ctx.reply("You don't have an active trip. Create one first!", {
      reply_markup: inlineKeyboard([[inlineButton("➕ Create trip", "trip:create")]]),
    });
    return;
  }

  const trip = store.getTrip(tripId);
  if (!trip) {
    await ctx.reply("Trip not found.");
    return;
  }

  if (!store.isMember(tripId, userId)) {
    await ctx.reply("You're not a member of this trip.");
    return;
  }

  if (userId === trip.organizerId) {
    await ctx.reply("The organizer can't leave their own trip.");
    return;
  }

  const removed = store.removeMember(tripId, userId);
  if (!removed) {
    await ctx.reply("Couldn't leave the trip.");
    return;
  }

  ctx.session.activeTripId = undefined;
  ctx.session.step = undefined;
  ctx.session.flow = {};

  const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
  await ctx.reply(`✅ You left "${trip.name}".`, { reply_markup: backToMenu });
});

export default composer;
