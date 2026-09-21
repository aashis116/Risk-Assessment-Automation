import { request } from 'playwright';

export async function createApiContext({ baseURL, token }) {
  return request.newContext({
    baseURL: `${baseURL}/api/v2/`,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getVendors(ctx) {
  const response = await ctx.get('vendors');
  if (!response.ok()) {
    throw new Error(`GET /vendors failed (${response.status()})`);
  }
  const { data } = await response.json();
  return data;
}

export async function getVendor(ctx, id) {
  const response = await ctx.get(`vendors/${id}`);
  if (!response.ok()) {
    throw new Error(`GET /vendors/${id} failed (${response.status()})`);
  }
  const { data } = await response.json();
  return data;
}
