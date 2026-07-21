import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { store } from "../store.js";

registerMainMenuItem({ label: "💰 Log expense", data: "trip:log", order: 30 });

const composer = new Composer<Ctx>();

composer.command("log", async (ctx) => {
  const tripId = ctx.session.activeTripId;
  if (!tripId) {
    await ctx.reply("You don't have an active trip yet. Create one first!", {
      reply_markup: inlineKeyboard([[inlineButton("➕ Create trip", "trip:create")]]),
    });
    return;
  }
  ctx.session.step = "awaiting_expense_amount";
  ctx.session.flow = {};
  await ctx.reply("How much did you spend?", {
    reply_markup: { force_reply: true, input_field_placeholder: "e.g. 42.50" },
  });
});

composer.callbackQuery("trip:log", async (ctx) => {
  await ctx.answerCallbackQuery();
  const tripId = ctx.session.activeTripId;
  if (!tripId) {
    await ctx.reply("You don't have an active trip yet. Create one first!", {
      reply_markup: inlineKeyboard([[inlineButton("➕ Create trip", "trip:create")]]),
    });
    return;
  }
  ctx.session.step = "awaiting_expense_amount";
  ctx.session.flow = {};
  await ctx.reply("How much did you spend?", {
    reply_markup: { force_reply: true, input_field_placeholder: "e.g. 42.50" },
  });
});

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (step === "awaiting_expense_amount") {
    const amount = parseFloat(ctx.message.text.trim());
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply("Please enter a positive number — e.g. 42.50");
      return;
    }
    ctx.session.flow = { ...ctx.session.flow, expenseAmount: amount };
    ctx.session.step = "awaiting_expense_description";
    await ctx.reply("What was it for?", {
      reply_markup: { force_reply: true, input_field_placeholder: "e.g. Dinner, Taxi, Hotel" },
    });
    return;
  }

  if (step === "awaiting_expense_description") {
    const description = ctx.message.text.trim();
    if (description.length === 0) {
      await ctx.reply("Can't be empty — what was the expense for?");
      return;
    }
    ctx.session.flow = { ...ctx.session.flow, expenseDescription: description };
    ctx.session.step = "awaiting_expense_payer";

    const tripId = ctx.session.activeTripId!;
    const members = store.getTripMembers(tripId);
    const buttons = members.map((m) => [
      inlineButton(
        m.userId === ctx.from?.id ? "Me" : `User ${m.userId}`,
        `trip:log:payer:${m.userId}`,
      ),
    ]);
    buttons.push([inlineButton("Someone else (enter ID)", "trip:log:payer:other")]);
    await ctx.reply("Who paid?", { reply_markup: inlineKeyboard(buttons) });
    return;
  }

  return next();
});

composer.callbackQuery("trip:log:payer:other", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_expense_payer_text";
  await ctx.reply("Enter the payer's user ID:", {
    reply_markup: { force_reply: true, input_field_placeholder: "User ID" },
  });
});

composer.callbackQuery(/^trip:log:payer:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const payerId = parseInt(ctx.match[1], 10);
  ctx.session.flow = { ...ctx.session.flow, expensePayerId: payerId };
  ctx.session.step = "awaiting_expense_beneficiaries";
  await askBeneficiaries(ctx);
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step === "awaiting_expense_payer_text") {
    const payerId = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(payerId)) {
      await ctx.reply("That's not a valid user ID — try a number.");
      return;
    }
    ctx.session.flow = { ...ctx.session.flow, expensePayerId: payerId };
    ctx.session.step = "awaiting_expense_beneficiaries";
    await askBeneficiaries(ctx);
    return;
  }

  if (ctx.session.step === "awaiting_expense_beneficiaries_text") {
    const tripId = ctx.session.activeTripId!;
    const flow = ctx.session.flow!;
    const input = ctx.message.text.trim();

    let beneficiaryIds: number[];
    if (input.toLowerCase() === "all" || input === "") {
      beneficiaryIds = store.getTripMembers(tripId).map((m) => m.userId);
    } else {
      beneficiaryIds = input
        .split(/[,\s]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      if (beneficiaryIds.length === 0) {
        await ctx.reply("No valid user IDs found. Try again or type 'all' to split among everyone:");
        return;
      }
    }

    const trip = store.getTrip(tripId)!;
    const amount = flow.expenseAmount!;
    const share = amount / beneficiaryIds.length;

    for (const bId of beneficiaryIds) {
      if (bId !== flow.expensePayerId) {
        store.addDebt(tripId, bId, flow.expensePayerId!, share);
      }
    }

    store.addExpense(tripId, amount, flow.expenseDescription!, flow.expensePayerId!, beneficiaryIds);

    ctx.session.step = undefined;
    ctx.session.flow = {};

    const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
    await ctx.reply(
      `✅ Logged: ${flow.expenseDescription} — ${trip.currency} ${amount.toFixed(2)}\nSplit among ${beneficiaryIds.length} people (${trip.currency} ${share.toFixed(2)} each)`,
      { reply_markup: backToMenu },
    );
    return;
  }

  return next();
});

async function askBeneficiaries(ctx: Ctx) {
  const tripId = ctx.session.activeTripId!;
  const members = store.getTripMembers(tripId);
  const memberList = members
    .map((m) => (m.userId === ctx.from?.id ? "You" : `User ${m.userId}`))
    .join(", ");

  await ctx.reply(
    `Who should split this? (comma-separated IDs, or "all" for everyone)\nMembers: ${memberList}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Split among all", "trip:log:bene:all")],
      ]),
    },
  );
}

composer.callbackQuery("trip:log:bene:all", async (ctx) => {
  await ctx.answerCallbackQuery();
  const tripId = ctx.session.activeTripId!;
  const flow = ctx.session.flow!;
  const beneficiaryIds = store.getTripMembers(tripId).map((m) => m.userId);
  const trip = store.getTrip(tripId)!;
  const amount = flow.expenseAmount!;
  const share = amount / beneficiaryIds.length;

  for (const bId of beneficiaryIds) {
    if (bId !== flow.expensePayerId) {
      store.addDebt(tripId, bId, flow.expensePayerId!, share);
    }
  }

  store.addExpense(tripId, amount, flow.expenseDescription!, flow.expensePayerId!, beneficiaryIds);

  ctx.session.step = undefined;
  ctx.session.flow = {};

  const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
  await ctx.reply(
    `✅ Logged: ${flow.expenseDescription} — ${trip.currency} ${amount.toFixed(2)}\nSplit among ${beneficiaryIds.length} people (${trip.currency} ${share.toFixed(2)} each)`,
    { reply_markup: backToMenu },
  );
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step === "awaiting_expense_beneficiaries_text") {
    const tripId = ctx.session.activeTripId!;
    const flow = ctx.session.flow!;
    const input = ctx.message.text.trim();

    let beneficiaryIds: number[];
    if (input.toLowerCase() === "all" || input === "") {
      beneficiaryIds = store.getTripMembers(tripId).map((m) => m.userId);
    } else {
      beneficiaryIds = input
        .split(/[,\s]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      if (beneficiaryIds.length === 0) {
        await ctx.reply("No valid user IDs found. Try again or type 'all' to split among everyone:");
        return;
      }
    }

    const trip = store.getTrip(tripId)!;
    const amount = flow.expenseAmount!;
    const share = amount / beneficiaryIds.length;

    for (const bId of beneficiaryIds) {
      if (bId !== flow.expensePayerId) {
        store.addDebt(tripId, bId, flow.expensePayerId!, share);
      }
    }

    store.addExpense(tripId, amount, flow.expenseDescription!, flow.expensePayerId!, beneficiaryIds);

    ctx.session.step = undefined;
    ctx.session.flow = {};

    const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
    await ctx.reply(
      `✅ Logged: ${flow.expenseDescription} — ${trip.currency} ${amount.toFixed(2)}\nSplit among ${beneficiaryIds.length} people (${trip.currency} ${share.toFixed(2)} each)`,
      { reply_markup: backToMenu },
    );
    return;
  }
  return next();
});

export default composer;
