import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../store.js";

registerMainMenuItem({ label: "🚪 Leave", data: "trip:leave", order: 80 });

const composer = new Composer<Ctx>();

composer.command("leave", async (ctx) => {
  await confirmLeave(ctx);
});

composer.callbackQuery("trip:leave", async (ctx) => {
  await ctx.answerCallbackQuery();
  await confirmLeave(ctx);
});

async function confirmLeave(ctx: Ctx) {
  const tripId = ctx.session.activeTripId;
  if (!tripId) {
    await ctx.reply("You don't have an active trip yet.", {
      reply_markup: inlineKeyboard([[inlineButton("➕ Create trip", "trip:create")]]),
    });
    return;
  }

  const trip = store.getTrip(tripId);
  if (!trip) {
    await ctx.reply("Trip not found.");
    return;
  }

  const userId = ctx.from?.id;
  if (!userId) return;

  if (!store.isMember(tripId, userId)) {
    await ctx.reply("You're not a member of this trip.");
    return;
  }

  if (userId === trip.organizerId) {
    await ctx.reply("The organizer can't leave their own trip. Transfer ownership or delete it instead.");
    return;
  }

  await ctx.reply(
    `Leave "${trip.name}"? You won't be able to see or log expenses in this trip anymore.`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("✅ Yes, leave", `trip:leave:confirm`),
          inlineButton("❌ Stay", "menu:main"),
        ],
      ]),
    },
  );
}

composer.callbackQuery("trip:leave:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const tripId = ctx.session.activeTripId;
  const userId = ctx.from?.id;

  if (!tripId || !userId) return;

  const trip = store.getTrip(tripId);
  if (!trip) {
    await ctx.reply("Trip not found.");
    return;
  }

  const removed = store.removeMember(tripId, userId);
  if (!removed) {
    await ctx.reply("You're not in this trip.");
    return;
  }

  ctx.session.activeTripId = undefined;
  ctx.session.step = undefined;
  ctx.session.flow = {};

  const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
  await ctx.reply(`✅ You left "${trip.name}".`, { reply_markup: backToMenu });
});

export default composer;
