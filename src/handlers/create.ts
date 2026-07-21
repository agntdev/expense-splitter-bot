import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../store.js";

registerMainMenuItem({ label: "➕ Create trip", data: "trip:create", order: 10 });

const composer = new Composer<Ctx>();

composer.command("create", async (ctx) => {
  ctx.session.step = "awaiting_trip_name";
  ctx.session.flow = {};
  await ctx.reply("What's the name of your trip?", {
    reply_markup: { force_reply: true, input_field_placeholder: "e.g. Weekend in Barcelona" },
  });
});

composer.callbackQuery("trip:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_trip_name";
  ctx.session.flow = {};
  await ctx.reply("What's the name of your trip?", {
    reply_markup: { force_reply: true, input_field_placeholder: "e.g. Weekend in Barcelona" },
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step === "awaiting_trip_name") {
    const name = ctx.message.text.trim();
    if (name.length === 0) {
      await ctx.reply("Trip name can't be empty — try again.");
      return;
    }
    ctx.session.flow = { tripName: name };
    ctx.session.step = "awaiting_trip_currency";
    await ctx.reply(`Got it! What currency for "${name}"? (default: USD)`, {
      reply_markup: inlineKeyboard([
        [
          inlineButton("USD", "trip:create:currency:USD"),
          inlineButton("EUR", "trip:create:currency:EUR"),
          inlineButton("GBP", "trip:create:currency:GBP"),
        ],
        [inlineButton("Other currency", "trip:create:currency:other")],
      ]),
    });
    return;
  }
  return next();
});

composer.callbackQuery("trip:create:currency:other", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_trip_currency_text";
  await ctx.reply("Type the currency code (e.g. JPY, CAD, AUD):", {
    reply_markup: { force_reply: true, input_field_placeholder: "Currency code" },
  });
});

composer.callbackQuery(/^trip:create:currency:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const currency = ctx.match[1];
  if (currency === "other") return;
  await finalizeCreateTrip(ctx, currency);
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step === "awaiting_trip_currency_text") {
    const currency = ctx.message.text.trim().toUpperCase();
    if (currency.length === 0 || currency.length > 5) {
      await ctx.reply("That doesn't look like a currency code — try a 3-letter code like USD or EUR.");
      return;
    }
    await finalizeCreateTrip(ctx, currency);
    return;
  }
  return next();
});

async function finalizeCreateTrip(ctx: Ctx, currency: string) {
  const name = ctx.session.flow?.tripName ?? "My Trip";
  const userId = ctx.from?.id;
  if (!userId) return;

  const trip = store.createTrip(name, currency, userId);
  ctx.session.activeTripId = trip.id;
  ctx.session.step = undefined;
  ctx.session.flow = {};

  const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
  await ctx.reply(
    `✅ Trip "${trip.name}" created!\nCurrency: ${trip.currency}\nYou're the organizer.`,
    { reply_markup: backToMenu },
  );
}

export default composer;
