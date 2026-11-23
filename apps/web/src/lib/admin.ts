import type { CurriculumTopic, TopicIdentity, TopicLevelStudy, TopicStudyContent, TopicStudyLevel } from '@app/shared';
import { requestTopicLevelStudy } from './topicLevelStudy';
import { getJson, postJson, patchJson, deleteJson, postFormData, type ChunkSentence, type SituationPrompt } from './collections';

export interface AdminUser {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string;
  isAdmin: boolean;
  premiumUntil: string | null;
  currentTariffId: string | null;
  dailyChecksUsed: number;
  dailyChecksDate: string | null;
}

export interface AdminCollection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: string;
  position: number;
  isPublished: boolean;
  bannerUrl: string | null;
  chunkCount: number;
}

export interface AdminChunk {
  id: string;
  text: string;
  translation: string;
  explanation: string | null;
  level: string;
  situationPrompts: SituationPrompt[];
  sentences: ChunkSentence[];
  hasDialogue: boolean;
  hasSituationDialogue: boolean;
  position: number;
}

export type NewCollectionInput = {
  slug: string;
  title: string;
  description?: string | null;
  level: string;
  position?: number;
  isPublished?: boolean;
  bannerUrl?: string | null;
};

export type CollectionPatch = Partial<Omit<NewCollectionInput, 'position'>> & { position?: number };

export type NewChunkInput = {
  text: string;
  translation: string;
  explanation?: string | null;
  level: string;
  situationPrompts?: SituationPrompt[];
  sentences?: ChunkSentence[];
};

export type ChunkPatch = Partial<NewChunkInput>;

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const data = await getJson<{ users: AdminUser[] }>('/api/admin/users');
  return data.users;
}

export async function setUserPremiumUntil(userId: string, premiumUntil: string | null): Promise<AdminUser> {
  const data = await patchJson<{ user: AdminUser }>(`/api/admin/users/${userId}`, { premiumUntil });
  return data.user;
}

export async function resetDailyChecks(userId: string): Promise<AdminUser> {
  const data = await postJson<{ user: AdminUser }>(`/api/admin/users/${userId}/reset-daily-checks`, {});
  return data.user;
}

export function regenerateUserProgram(userId: string) {
  return postJson<{ status: 'ready' }>(`/api/admin/users/${userId}/regenerate-program`, {});
}

export async function uploadCollectionBanner(file: File): Promise<string> {
  const form = new FormData();
  form.set('file', file);
  const data = await postFormData<{ url: string }>('/api/admin/uploads/banner', form);
  return data.url;
}

export async function fetchAdminCollections(): Promise<AdminCollection[]> {
  const data = await getJson<{ collections: AdminCollection[] }>('/api/admin/collections');
  return data.collections;
}

export async function createAdminCollection(input: NewCollectionInput): Promise<AdminCollection> {
  const data = await postJson<{ collection: AdminCollection }>('/api/admin/collections', input);
  return data.collection;
}

export async function updateAdminCollection(id: string, patch: CollectionPatch): Promise<AdminCollection> {
  const data = await patchJson<{ collection: AdminCollection }>(`/api/admin/collections/${id}`, patch);
  return data.collection;
}

export async function fetchAdminChunks(collectionId: string): Promise<AdminChunk[]> {
  const data = await getJson<{ chunks: AdminChunk[] }>(`/api/admin/collections/${collectionId}/chunks`);
  return data.chunks;
}

export async function createAdminChunk(collectionId: string, input: NewChunkInput): Promise<AdminChunk> {
  const data = await postJson<{ chunk: AdminChunk }>(`/api/admin/collections/${collectionId}/chunks`, input);
  return data.chunk;
}

export async function updateAdminChunk(id: string, patch: ChunkPatch): Promise<Omit<AdminChunk, 'position'>> {
  const data = await patchJson<{ chunk: Omit<AdminChunk, 'position'> }>(`/api/admin/chunks/${id}`, patch);
  return data.chunk;
}

export async function deleteAdminChunk(id: string): Promise<void> {
  await deleteJson(`/api/admin/chunks/${id}`);
}

export async function removeChunkFromCollection(collectionId: string, chunkId: string): Promise<void> {
  await deleteJson(`/api/admin/collections/${collectionId}/chunks/${chunkId}`);
}

export interface AdminAiLog {
  id: string;
  createdAt: string;
  provider: string;
  model: string | null;
  userEmail: string | null;
  chunkText: string | null;
  request: unknown;
  response: unknown | null;
  error: string | null;
  durationMs: number;
}

export async function fetchAdminAiLogs(limit = 100): Promise<AdminAiLog[]> {
  const data = await getJson<{ logs: AdminAiLog[] }>(`/api/admin/ai-logs?limit=${limit}`);
  return data.logs;
}

export interface AdminPayment {
  id: string;
  userEmail: string | null;
  provider: string;
  plan: string;
  tariffId: string | null;
  status: string;
  amount: string | null;
  currency: string | null;
  createdAt: string;
}

export async function fetchAdminPayments(limit = 100): Promise<AdminPayment[]> {
  const data = await getJson<{ payments: AdminPayment[] }>(`/api/admin/payments?limit=${limit}`);
  return data.payments;
}

export type TariffPeriodicity = 'monthly' | 'yearly';

export interface AdminTariff {
  id: string;
  name: string;
  periodicity: TariffPeriodicity;
  offerUrl: string | null;
  priceUsd: string | null;
  priceEur: string | null;
  priceRub: string | null;
  allowCards: boolean;
  allowProgram: boolean;
  dailyCheckLimit: number | null;
  monthlyPlacementLimit: number | null;
  isDefault: boolean;
  position: number;
  upsellTariffIds: string[];
  updatedAt: string;
}

export interface TariffInput {
  name: string;
  periodicity: TariffPeriodicity;
  offerUrl: string | null;
  priceUsd: number | null;
  priceEur: number | null;
  priceRub: number | null;
  allowCards: boolean;
  allowProgram: boolean;
  dailyCheckLimit: number | null;
  monthlyPlacementLimit: number | null;
  isDefault: boolean;
  position: number;
  upsellTariffIds: string[];
}

export async function fetchAdminTariffs(): Promise<AdminTariff[]> {
  const data = await getJson<{ tariffs: AdminTariff[] }>('/api/admin/tariffs');
  return data.tariffs;
}

export async function createAdminTariff(input: TariffInput): Promise<AdminTariff> {
  const data = await postJson<{ tariff: AdminTariff }>('/api/admin/tariffs', input);
  return data.tariff;
}

export async function updateAdminTariff(id: string, input: TariffInput): Promise<AdminTariff> {
  const data = await patchJson<{ tariff: AdminTariff }>(`/api/admin/tariffs/${id}`, input);
  return data.tariff;
}

export async function deleteAdminTariff(id: string): Promise<void> {
  await deleteJson(`/api/admin/tariffs/${id}`);
}

export interface AdminProgramTopic {
  id: string;
  userEmail: string | null;
  title: string;
  category: string;
  status: 'assigned' | 'passed_once' | 'mastered';
  source: 'placement' | 'discovered';
  nextReviewAt: string | null;
  updatedAt: string;
}

export async function fetchAdminProgramTopics(limit = 100): Promise<AdminProgramTopic[]> {
  const data = await getJson<{ topics: AdminProgramTopic[] }>(`/api/admin/program-topics?limit=${limit}`);
  return data.topics;
}

export interface ProductionModelStats {
  model: string;
  calls: number;
  errors: number;
  up: number;
  down: number;
}

export async function fetchProductionModelStats(): Promise<ProductionModelStats[]> {
  const { models } = await getJson<{ models: ProductionModelStats[] }>('/api/admin/production-model-stats');
  return models;
}

export interface AdminCatalogTopic extends TopicIdentity {
  aliases: string[];
  study: TopicStudyContent | null;
  curriculumId: string | null;
  curriculumSlot: boolean;
  ratings?: { clear: number; unclear: number };
  variants?: Pick<AdminCatalogTopic, 'key' | 'title' | 'curriculumSlot'>[];
}

export function fetchAdminTopicCatalog(q: string, offset: number) {
  const query = new URLSearchParams({ q, offset: String(offset) });
  return getJson<{ topics: (TopicIdentity & { topicNumber?: number | null; clear: number; unclear: number })[]; nextOffset: number | null }>(`/api/admin/topic-catalog?${query}`);
}

export async function fetchAdminCatalogTopic(key: string) {
  return (await getJson<{ topic: AdminCatalogTopic }>(`/api/admin/topic-catalog/${encodeURIComponent(key)}`)).topic;
}

export async function saveAdminCatalogTopic({ key, title, level, category }: TopicIdentity) {
  return (await patchJson<{ topic: AdminCatalogTopic }>(`/api/admin/topic-catalog/${encodeURIComponent(key)}`, { title, level, category })).topic;
}

export async function fetchCurriculumTopics() {
  return (await getJson<{ topics: CurriculumTopic[] }>('/api/admin/curriculum-topics')).topics;
}

export async function addCurriculumTopic(topic: CurriculumTopic) {
  return (await postJson<{ topic: CurriculumTopic }>('/api/admin/curriculum-topics', topic)).topic;
}

export async function saveCurriculumTopic({ id, title, level, category, objective, subtopics }: CurriculumTopic) {
  return (await patchJson<{ topic: CurriculumTopic }>(`/api/admin/curriculum-topics/${encodeURIComponent(id)}`, {
    title, level, category, objective, subtopics,
  })).topic;
}

export async function saveAdminTopicStudy(key: string, study: TopicStudyContent) {
  return (await patchJson<{ study: TopicStudyContent }>(`/api/admin/topic-catalog/${encodeURIComponent(key)}/study`, study)).study;
}

function adminLevelStudyPath(key: string, level: TopicStudyLevel) {
  return `/api/admin/topic-catalog/${encodeURIComponent(key)}/level-study/${level}`;
}

export function fetchAdminLevelStudy(key: string, level: TopicStudyLevel) {
  return getJson<TopicLevelStudy>(adminLevelStudyPath(key, level));
}

export function generateAdminLevelStudy(key: string, level: TopicStudyLevel) {
  return requestTopicLevelStudy(adminLevelStudyPath(key, level));
}

export function saveAdminLevelStudy(key: string, level: TopicStudyLevel, study: TopicStudyContent) {
  return patchJson<TopicLevelStudy>(adminLevelStudyPath(key, level), study);
}

export function setTopicCurriculumLink(key: string, curriculumId: string | null) {
  return patchJson<{ ok: true }>(`/api/admin/topic-catalog/${encodeURIComponent(key)}/curriculum`, { curriculumId });
}
