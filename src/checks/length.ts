import { countWords, type Channel, type Check } from "../types";

/** Hard ceilings per channel. A text that reads like an email is not sendable. */
export const WORD_CAP: Record<Channel, number> = {
  text: 40,
  chat: 60,
  email: 100,
};

export const length: Check = ({ message, options }) => {
  const cap = WORD_CAP[options.channel];
  const n = countWords(message);

  if (n <= cap) return [];

  return [
    {
      check: "length",
      reason: `${n} words; cap for ${options.channel} is ${cap}`,
      repair:
        `The message is ${n} words but must be ${cap} or fewer. ` +
        `Cut filler and hedging. Do not drop the request, and do not drop any fact.`,
    },
  ];
};
