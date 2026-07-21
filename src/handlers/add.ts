import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../store.js";

registerMainMenuItem({ label: "👤 Add member", data: "trip:add", order: 20 });

const composer = new Composer<Ctx>();

composer.command("add", async (ctx) => {
  const tripId = ctx.session.activeTripId;
  if (!tripId) {
    await ctx.reply("You don't have an active trip yet. Create one first!", {
      reply_markup: inlineKeyboard([[inlineButton("➕ Create trip", "trip:create")]]),
    });
    return;
  }
  ctx.session.step = "awaiting_add_user";
  await ctx.reply("Send me the user ID or username of the person to add:", {
    reply_markup: { force_reply: true, input_field_placeholder: "User ID or @username" },
  });
});

composer.callbackQuery("trip:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  const tripId = ctx.session.activeTripId;
  if (!tripId) {
    await ctx.reply("You don't have an active trip yet. Create one first!", {
      reply_markup: inlineKeyboard([[inlineButton("➕ Create trip", "trip:create")]]),
    });
    return;
  }
  ctx.session.step = "awaiting_add_user";
  await ctx.reply("Send me the user ID or username of the person to add:", {
    reply_markup: { force_reply: true, input_field_placeholder: "User ID or @username" },
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step === "awaiting_add_user") {
    const tripId = ctx.session.activeTripId;
    if (!tripId) {
      await ctx.reply("No active trip. Create one first!");
      ctx.session.step = undefined;
      return;
    }

    const input = ctx.message.text.trim();
    let userId: number | null = null;

    // Parse numeric user ID
    const numMatch = /^(\d+)$/.exec(input);
    if (numMatch) {
      userId = parseInt(numMatch[1], 10);
    } else if (input.startsWith("@")) {
      // For @username, we use the username hash as a synthetic ID
      // In production, you'd use Bot API's getChat to resolve usernames
      userId = hashCode(input);
    } else {
      await ctx.reply("I need a user ID (number) or @username. Try again:");
      return;
    }

    const userId_ = userId!;
    const myId = ctx.from?.id;
    if (userId_ === myId) {
      await ctx.reply("You're already in the trip — no need to add yourself!");
      ctx.session.step = undefined;
      return;
    }

    if (store.isMember(tripId, userId_)) {
      await ctx.reply("That person is already in the trip.");
      ctx.session.step = undefined;
      return;
    }

    const member = store.addMember(tripId, userId_);
    if (!member) {
      await ctx.reply("Couldn't add that person. Make sure the user ID is correct.");
      ctx.session.step = undefined;
      return;
    }

    ctx.session.step = undefined;
    const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
    await ctx.reply(`✅ Added to the trip!`, { reply_markup: backToMenu });
    return;
  }
  return next();
});

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export default composer;
