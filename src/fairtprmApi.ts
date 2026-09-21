import { request, type APIRequestContext } from '@playwright/test';
import type { Vendor } from './types.js';

export async function createApiContext({ baseURL, token }: { baseURL: string; token: string }): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: `${baseURL}/api/v2/`,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getVendors(ctx: APIRequestContext): Promise<Vendor[]> {
  const response = await ctx.get('vendors');
  if (!response.ok()) {
    throw new Error(`GET /vendors failed (${response.status()})`);
  }
  const { data } = await response.json();
  return data;
}

export async function getVendor(ctx: APIRequestContext, id: number): Promise<Vendor> {
  const response = await ctx.get(`vendors/${id}`);
  if (!response.ok()) {
    throw new Error(`GET /vendors/${id} failed (${response.status()})`);
  }
  const { data } = await response.json();
  return data;
}
