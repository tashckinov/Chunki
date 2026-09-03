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
      },
      {
        text: "I'm running late",
        translation: 'я опаздываю',
        explanation: 'Used when you expect to arrive later than planned.',
        example: "Sorry, I'm running late — I'll be there in ten minutes.",
        exampleTranslation: 'Извини, я опаздываю. Буду через десять минут.',
        level: 'A2',
      },
      {
        text: 'it depends on',
        translation: 'это зависит от',
        explanation: 'Used to say that a decision or outcome is not fixed and relies on something else.',
        example: 'It depends on the weather — we might cancel the trip.',
        exampleTranslation: 'Это зависит от погоды — мы можем отменить поездку.',
        level: 'B1',
      },
      {
        text: 'to be exact',
        translation: 'если быть точным, точнее говоря',
        explanation: 'Used when giving a more precise version of something you just said.',
        example: "It's been five years, ten months to be exact.",
        exampleTranslation: 'Прошло пять лет, если быть точным — десять месяцев.',
        level: 'B1',
      },
      {
        text: 'make sure',
        translation: 'убедиться, проследить за тем чтобы',
        explanation: 'Used to tell someone to check that something is done or true.',
        example: 'Make sure you lock the door before you leave.',
        exampleTranslation: 'Убедись, что запер дверь перед уходом.',
        level: 'A2',
      },
      KEEP_IN_MIND,
      {
        text: 'figure something out',
        translation: 'разобраться в чём-то, придумать решение',
        explanation: 'To find a solution to a problem, often after some thought.',
        example: "Don't worry, we'll figure it out together.",
        exampleTranslation: 'Не переживай, мы вместе разберёмся.',
        level: 'B1',
      },
      {
        text: 'take your time',
        translation: 'не торопись',
        explanation: 'Used to tell someone there is no need to hurry.',
        example: "Take your time, we don't need to leave for another hour.",
        exampleTranslation: 'Не торопись, нам не нужно выходить ещё час.',
        level: 'A2',
      },
      {
        text: 'no worries',
        translation: 'без проблем, не переживай',
        explanation: 'A casual way to say something is fine or to accept an apology.',
        example: "No worries, it happens to everyone.",
        exampleTranslation: 'Без проблем, с каждым бывает.',
        level: 'A2',
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
      },
      {
        text: 'carry-on luggage',
        translation: 'ручная кладь',
        explanation: 'A bag small enough to bring into the airplane cabin instead of checking it in.',
        example: 'You can bring one piece of carry-on luggage.',
        exampleTranslation: 'Можно взять одну сумку ручной клади.',
        level: 'A2',
      },
      {
        text: 'miss a flight',
        translation: 'опоздать на рейс',
        explanation: 'To arrive too late to board a flight you were supposed to take.',
        example: "We almost missed our flight because of the traffic.",
        exampleTranslation: 'Мы чуть не опоздали на рейс из-за пробок.',
        level: 'A2',
      },
      {
        text: 'board the plane',
        translation: 'сесть в самолёт, произвести посадку',
        explanation: 'To get on an airplane before it departs.',
        example: 'Passengers will board the plane at gate 12.',
        exampleTranslation: 'Посадка пассажиров будет у выхода 12.',
        level: 'A2',
      },
      {
        text: 'go through security',
        translation: 'пройти контроль безопасности',
        explanation: 'The airport check where bags and passengers are screened.',
        example: 'It took twenty minutes to go through security.',
        exampleTranslation: 'Прохождение контроля безопасности заняло двадцать минут.',
        level: 'A2',
      },
      {
        text: 'book a room',
        translation: 'забронировать номер',
        explanation: 'To reserve a hotel room in advance.',
        example: "I'd like to book a room for two nights.",
        exampleTranslation: 'Я хотел бы забронировать номер на две ночи.',
        level: 'A2',
      },
      {
        text: 'a round trip',
        translation: 'поездка туда и обратно',
        explanation: 'A journey to a place and back again, often used for tickets.',
        example: 'A round trip ticket is usually cheaper than two one-way tickets.',
        exampleTranslation: 'Билет туда-обратно обычно дешевле двух билетов в одну сторону.',
        level: 'A2',
      },
      {
        text: 'a layover',
        translation: 'пересадка (в другом городе)',
        explanation: 'A stop between flights, often in a different city, before continuing to your destination.',
        example: 'We have a two-hour layover in Istanbul.',
        exampleTranslation: 'У нас двухчасовая пересадка в Стамбуле.',
        level: 'B1',
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
      },
      KEEP_IN_MIND,
      {
        text: 'get back to someone',
        translation: 'ответить кому-то позже, связаться позже',
        explanation: "Used when you can't answer right away and will reply later.",
        example: "Let me check the schedule and get back to you tomorrow.",
        exampleTranslation: 'Дай я проверю расписание и отвечу тебе завтра.',
        level: 'B1',
      },
      {
        text: 'touch base',
        translation: 'связаться, обсудить кратко',
        explanation: 'To make brief contact with someone, often to check on progress.',
        example: "Let's touch base again next week.",
        exampleTranslation: 'Давай снова созвонимся на следующей неделе.',
        level: 'B1',
      },
      {
        text: 'follow up on something',
        translation: 'уточнить, довести до конца',
        explanation: 'To check the progress or result of something already started.',
        example: "I'll follow up on the invoice tomorrow morning.",
        exampleTranslation: 'Я уточню насчёт счёта завтра утром.',
        level: 'B1',
      },
      {
        text: 'on the same page',
        translation: 'на одной волне, одинаково понимать ситуацию',
        explanation: 'Used when people share the same understanding or plan.',
        example: "Before we start, let's make sure we're on the same page.",
        exampleTranslation: 'Прежде чем начать, давайте убедимся, что мы на одной волне.',
        level: 'B1',
      },
      {
        text: 'reach out to someone',
        translation: 'обратиться к кому-то, связаться',
        explanation: 'To contact someone, especially to ask for help or start a conversation.',
        example: "Feel free to reach out if you have any questions.",
        exampleTranslation: 'Не стесняйтесь обращаться, если появятся вопросы.',
        level: 'B1',
      },
      {
        text: 'put together a report',
        translation: 'составить отчёт',
        explanation: 'To create a report by gathering and organizing information.',
        example: "She put together a report on last quarter's sales.",
        exampleTranslation: 'Она составила отчёт по продажам за прошлый квартал.',
        level: 'B1',
      },
    ],
  },
];

async function upsertChunk(pool: pg.Pool, chunk: SeedChunk): Promise<string> {
  const existing = await pool.query<{ id: string }>('SELECT id FROM chunks WHERE text = $1', [chunk.text]);
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE chunks SET translation = $2, explanation = $3, example = $4, example_translation = $5, level = $6, updated_at = now()
       WHERE id = $1`,
      [existing.rows[0].id, chunk.translation, chunk.explanation, chunk.example, chunk.exampleTranslation, chunk.level],
    );
    return existing.rows[0].id;
  }
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO chunks (text, translation, explanation, example, example_translation, level)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [chunk.text, chunk.translation, chunk.explanation, chunk.example, chunk.exampleTranslation, chunk.level],
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
