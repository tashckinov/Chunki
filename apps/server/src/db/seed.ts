// Development/demo content for collections + chunks — not the final
// learning dataset. Safe to run more than once: collections upsert by slug,
// chunks upsert by text, and collection_chunks upsert by the (collection,
// chunk) pair, so re-running just refreshes the same rows.
import pg from 'pg';
import { loadEnv } from '../config/env.js';

interface SeedChunk {
  text: string;
  translation: string;
  explanation: string;
  example: string;
  exampleTranslation: string;
  level: string;
  /**
   * Hand-authored scenario for the production check — most chunks won't
   * have one yet (that's a separate content-authoring task); a handful of
   * placeholders here just give local dev/testing something to exercise.
   */
  situationPrompt?: string;
}

interface SeedCollection {
  slug: string;
  title: string;
  description: string;
  level: string;
  position: number;
  chunks: SeedChunk[];
}

const KEEP_IN_MIND: SeedChunk = {
  text: 'keep in mind',
  translation: 'иметь в виду, не забывать',
  explanation: 'Used to remind someone of something important before they act or decide.',
  example: 'Keep in mind that the store closes at 8 tonight.',
  exampleTranslation: 'Имей в виду, что магазин сегодня закрывается в 8.',
  level: 'B1',
  situationPrompt: "Your friend is about to go grocery shopping but it's getting late. What would you tell them about the store's closing time?",
};

const SEED: SeedCollection[] = [
  {
    slug: 'everyday-english',
    title: 'Everyday English',
    description: 'Common expressions you hear and use in casual daily conversation.',
    level: 'A2',
    position: 10,
    chunks: [
      {
        text: 'sounds good',
        translation: 'звучит хорошо, договорились',
        explanation: 'A friendly way to agree to a plan or suggestion.',
        example: "Seven o'clock at the usual place? Sounds good.",
        exampleTranslation: 'В семь на обычном месте? Договорились.',
        level: 'A2',
        situationPrompt: 'A friend suggests meeting at 7pm at your usual café. You\'re happy with that. What do you reply?',
      },
      {
        text: "I'm running late",
        translation: 'я опаздываю',
        explanation: 'Used when you expect to arrive later than planned.',
        example: "Sorry, I'm running late — I'll be there in ten minutes.",
        exampleTranslation: 'Извини, я опаздываю. Буду через десять минут.',
        level: 'A2',
        situationPrompt: "You're going to be a few minutes late to meet a friend. You want to text them a quick heads-up. What do you write?",
      },
      {
        text: 'it depends on',
        translation: 'это зависит от',
        explanation: 'Used to say that a decision or outcome is not fixed and relies on something else.',
        example: 'It depends on the weather — we might cancel the trip.',
        exampleTranslation: 'Это зависит от погоды — мы можем отменить поездку.',
        level: 'B1',
        situationPrompt: "A friend asks if you're going to the picnic this weekend, but it might rain and you're not sure yet. How do you answer?",
      },
      {
        text: 'to be exact',
        translation: 'если быть точным, точнее говоря',
        explanation: 'Used when giving a more precise version of something you just said.',
        example: "It's been five years, ten months to be exact.",
        exampleTranslation: 'Прошло пять лет, если быть точным — десять месяцев.',
        level: 'B1',
        situationPrompt: "You're telling a friend how long you've been learning English — about three years, and nine months if you count precisely. How do you phrase that?",
      },
      {
        text: 'make sure',
        translation: 'убедиться, проследить за тем чтобы',
        explanation: 'Used to tell someone to check that something is done or true.',
        example: 'Make sure you lock the door before you leave.',
        exampleTranslation: 'Убедись, что запер дверь перед уходом.',
        level: 'A2',
        situationPrompt: "Your roommate is leaving the house and might forget to turn off the stove. What do you remind them to check?",
      },
      KEEP_IN_MIND,
      {
        text: 'figure something out',
        translation: 'разобраться в чём-то, придумать решение',
        explanation: 'To find a solution to a problem, often after some thought.',
        example: "Don't worry, we'll figure it out together.",
        exampleTranslation: 'Не переживай, мы вместе разберёмся.',
        level: 'B1',
        situationPrompt: "A friend is stressed about a problem that doesn't have an obvious solution yet. How do you reassure them you'll find a way through it together?",
      },
      {
        text: 'take your time',
        translation: 'не торопись',
        explanation: 'Used to tell someone there is no need to hurry.',
        example: "Take your time, we don't need to leave for another hour.",
        exampleTranslation: 'Не торопись, нам не нужно выходить ещё час.',
        level: 'A2',
        situationPrompt: "A colleague is rushing to finish a task, but you don't need it for another hour. What do you tell them?",
      },
      {
        text: 'no worries',
        translation: 'без проблем, не переживай',
        explanation: 'A casual way to say something is fine or to accept an apology.',
        example: "No worries, it happens to everyone.",
        exampleTranslation: 'Без проблем, с каждым бывает.',
        level: 'A2',
        situationPrompt: "A friend apologizes for showing up ten minutes late. How do you casually tell them it's totally fine?",
      },
    ],
  },
  {
    slug: 'travel-basics',
    title: 'Travel Basics',
    description: 'Useful English chunks for airports, hotels and travelling.',
    level: 'A2',
    position: 20,
    chunks: [
      {
        text: 'check in',
        translation: 'зарегистрироваться (на рейс, в отеле)',
        explanation: 'To officially arrive and register at an airport or hotel.',
        example: 'We need to check in before 6 p.m.',
        exampleTranslation: 'Нам нужно зарегистрироваться до 18:00.',
        level: 'A2',
        situationPrompt: "You've just arrived at the airport and need to register for your flight before a deadline. What do you tell your travel companion you need to do first?",
      },
      {
        text: 'carry-on luggage',
        translation: 'ручная кладь',
        explanation: 'A bag small enough to bring into the airplane cabin instead of checking it in.',
        example: 'You can bring one piece of carry-on luggage.',
        exampleTranslation: 'Можно взять одну сумку ручной клади.',
        level: 'A2',
        situationPrompt: "An airline employee asks how many bags you're bringing into the cabin. You have one small bag. How do you describe it?",
      },
      {
        text: 'miss a flight',
        translation: 'опоздать на рейс',
        explanation: 'To arrive too late to board a flight you were supposed to take.',
        example: "We almost missed our flight because of the traffic.",
        exampleTranslation: 'Мы чуть не опоздали на рейс из-за пробок.',
        level: 'A2',
        situationPrompt: "Traffic made you very late to the airport and you're worried you won't make your flight in time. What do you tell your travel companion?",
      },
      {
        text: 'board the plane',
        translation: 'сесть в самолёт, произвести посадку',
        explanation: 'To get on an airplane before it departs.',
        example: 'Passengers will board the plane at gate 12.',
        exampleTranslation: 'Посадка пассажиров будет у выхода 12.',
        level: 'A2',
        situationPrompt: "An announcement says it's time to get on the plane at gate 12. How do you tell your friend it's time?",
      },
      {
        text: 'go through security',
        translation: 'пройти контроль безопасности',
        explanation: 'The airport check where bags and passengers are screened.',
        example: 'It took twenty minutes to go through security.',
        exampleTranslation: 'Прохождение контроля безопасности заняло двадцать минут.',
        level: 'A2',
        situationPrompt: "You're telling a friend about your airport experience — the screening check where they scanned your bags took twenty minutes. What part of the process are you describing?",
      },
      {
        text: 'book a room',
        translation: 'забронировать номер',
        explanation: 'To reserve a hotel room in advance.',
        example: "I'd like to book a room for two nights.",
        exampleTranslation: 'Я хотел бы забронировать номер на две ночи.',
        level: 'A2',
        situationPrompt: "You're calling a hotel to reserve a room for two nights. What do you tell the receptionist?",
      },
      {
        text: 'a round trip',
        translation: 'поездка туда и обратно',
        explanation: 'A journey to a place and back again, often used for tickets.',
        example: 'A round trip ticket is usually cheaper than two one-way tickets.',
        exampleTranslation: 'Билет туда-обратно обычно дешевле двух билетов в одну сторону.',
        level: 'A2',
        situationPrompt: "You're buying a plane ticket that includes both the flight there and the flight back. How do you describe this kind of ticket to the travel agent?",
      },
      {
        text: 'a layover',
        translation: 'пересадка (в другом городе)',
        explanation: 'A stop between flights, often in a different city, before continuing to your destination.',
        example: 'We have a two-hour layover in Istanbul.',
        exampleTranslation: 'У нас двухчасовая пересадка в Стамбуле.',
        level: 'B1',
        situationPrompt: "Your flight to Rome includes a two-hour stop in Istanbul before continuing on. How do you describe this stop to a friend?",
      },
    ],
  },
  {
    slug: 'work-communication',
    title: 'Work & Communication',
    description: 'Chunks for meetings, email and everyday conversation at work.',
    level: 'B1',
    position: 30,
    chunks: [
      {
        text: 'make a decision',
        translation: 'принять решение',
        explanation: 'To choose between options after considering them.',
        example: "We need to make a decision by Friday.",
        exampleTranslation: 'Нам нужно принять решение к пятнице.',
        level: 'B1',
        situationPrompt: "Your team has two options for a project and needs to choose one by Friday. What do you tell your colleagues you need to do by then?",
      },
      KEEP_IN_MIND,
      {
        text: 'get back to someone',
        translation: 'ответить кому-то позже, связаться позже',
        explanation: "Used when you can't answer right away and will reply later.",
        example: "Let me check the schedule and get back to you tomorrow.",
        exampleTranslation: 'Дай я проверю расписание и отвечу тебе завтра.',
        level: 'B1',
        situationPrompt: "A colleague asks a question you can't answer right now. You need to check something first and reply tomorrow. What do you tell them?",
      },
      {
        text: 'touch base',
        translation: 'связаться, обсудить кратко',
        explanation: 'To make brief contact with someone, often to check on progress.',
        example: "Let's touch base again next week.",
        exampleTranslation: 'Давай снова созвонимся на следующей неделе.',
        level: 'B1',
        situationPrompt: "A colleague asks how you'd like to stay updated on a project over the next few weeks, without formal meetings. What do you suggest?",
      },
      {
        text: 'follow up on something',
        translation: 'уточнить, довести до конца',
        explanation: 'To check the progress or result of something already started.',
        example: "I'll follow up on the invoice tomorrow morning.",
        exampleTranslation: 'Я уточню насчёт счёта завтра утром.',
        level: 'B1',
        situationPrompt: "You told a client you'd check on the status of an invoice. What do you tell a colleague you'll do about it tomorrow morning?",
      },
      {
        text: 'on the same page',
        translation: 'на одной волне, одинаково понимать ситуацию',
        explanation: 'Used when people share the same understanding or plan.',
        example: "Before we start, let's make sure we're on the same page.",
        exampleTranslation: 'Прежде чем начать, давайте убедимся, что мы на одной волне.',
        level: 'B1',
        situationPrompt: "Before starting a project with your team, you want to make sure everyone shares the same understanding of the plan. What do you say?",
      },
      {
        text: 'reach out to someone',
        translation: 'обратиться к кому-то, связаться',
        explanation: 'To contact someone, especially to ask for help or start a conversation.',
        example: "Feel free to reach out if you have any questions.",
        exampleTranslation: 'Не стесняйтесь обращаться, если появятся вопросы.',
        level: 'B1',
        situationPrompt: "You're telling a new colleague that they can contact you anytime if they have questions. What do you say?",
      },
      {
        text: 'put together a report',
        translation: 'составить отчёт',
        explanation: 'To create a report by gathering and organizing information.',
        example: "She put together a report on last quarter's sales.",
        exampleTranslation: 'Она составила отчёт по продажам за прошлый квартал.',
        level: 'B1',
        situationPrompt: "Your manager asks what you did with last quarter's sales data. You gathered and organized it into a document. How do you describe what you did?",
      },
    ],
  },
];

async function upsertChunk(pool: pg.Pool, chunk: SeedChunk): Promise<string> {
  const existing = await pool.query<{ id: string }>('SELECT id FROM chunks WHERE text = $1', [chunk.text]);
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE chunks SET translation = $2, explanation = $3, example = $4, example_translation = $5, level = $6, situation_prompt = $7, updated_at = now()
       WHERE id = $1`,
      [existing.rows[0].id, chunk.translation, chunk.explanation, chunk.example, chunk.exampleTranslation, chunk.level, chunk.situationPrompt ?? null],
    );
    return existing.rows[0].id;
  }
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO chunks (text, translation, explanation, example, example_translation, level, situation_prompt)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [chunk.text, chunk.translation, chunk.explanation, chunk.example, chunk.exampleTranslation, chunk.level, chunk.situationPrompt ?? null],
  );
  return inserted.rows[0].id;
}

async function main() {
  const env = loadEnv();
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

  try {
    for (const collection of SEED) {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO collections (slug, title, description, level, position, is_published)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           level = EXCLUDED.level,
           position = EXCLUDED.position,
           updated_at = now()
         RETURNING id`,
        [collection.slug, collection.title, collection.description, collection.level, collection.position],
      );
      const collectionId = rows[0].id;

      for (let i = 0; i < collection.chunks.length; i++) {
        const chunkId = await upsertChunk(pool, collection.chunks[i]);
        await pool.query(
          `INSERT INTO collection_chunks (collection_id, chunk_id, position)
           VALUES ($1, $2, $3)
           ON CONFLICT (collection_id, chunk_id) DO UPDATE SET position = EXCLUDED.position`,
          [collectionId, chunkId, i],
        );
      }

      console.log(`Seeded "${collection.title}" (${collection.chunks.length} chunks)`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
