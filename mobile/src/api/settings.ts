import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export type ShopSettings = {
  name: string;
  address: string | null;
  phone: string | null;
  logoPath: string | null;
  defaultRate: number | null;
  defaultYears: number | null;
  whatsappTemplate: string | null;
};

export type ShopSettingsInput = {
  name: string;
  address: string | null;
  phone: string | null;
  defaultRate: number | null;
  defaultYears: number | null;
  whatsappTemplate: string | null;
};

const LOGO_BUCKET = 'shop-logos';
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export function useShopSettings() {
  const tenantId = useAuth().profile?.tenant_id ?? null;
  return useQuery({
    queryKey: ['shopSettings', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ShopSettings> => {
      const { data, error } = await supabase
        .from('tenant')
        .select('name, address, phone, logo_path, default_rate, default_years, whatsapp_template')
        .eq('id', tenantId as string)
        .single();
      if (error) throw error;
      return {
        name: data.name,
        address: data.address,
        phone: data.phone,
        logoPath: data.logo_path,
        defaultRate: data.default_rate,
        defaultYears: data.default_years,
        whatsappTemplate: data.whatsapp_template,
      };
    },
  });
}

export function useUpdateShopSettings() {
  const qc = useQueryClient();
  const { refreshShopName } = useAuth();
  return useMutation({
    mutationFn: async (input: ShopSettingsInput): Promise<void> => {
      // Generated RPC arg types are non-nullable; the SQL function accepts null.
      const { error } = await supabase.rpc('update_shop_settings', {
        p_name: input.name,
        p_address: input.address as string,
        p_phone: input.phone as string,
        p_default_rate: input.defaultRate as number,
        p_default_years: input.defaultYears as number,
        p_whatsapp_template: input.whatsappTemplate as string,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['shopSettings'] });
      await refreshShopName();
    },
  });
}

/** Uploads a new logo, points the tenant at it, then best-effort removes the previous object. */
export async function uploadShopLogo(
  tenantId: string,
  file: Blob,
  mime: string,
  previousPath?: string | null,
): Promise<string> {
  const path = `${tenantId}/logo-${Date.now()}.${EXT[mime] ?? 'png'}`;
  const up = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { contentType: mime, upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.rpc('set_shop_logo', { p_path: path });
  if (error) {
    await supabase.storage.from(LOGO_BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  if (previousPath && previousPath !== path) {
    await supabase.storage.from(LOGO_BUCKET).remove([previousPath]).catch(() => {});
  }
  return path;
}

export async function removeShopLogo(_tenantId: string, path: string): Promise<void> {
  const { error } = await supabase.rpc('set_shop_logo', { p_path: null as unknown as string });
  if (error) throw error;
  await supabase.storage.from(LOGO_BUCKET).remove([path]).catch(() => {});
}

export function useLogoUrl(path: string | null) {
  return useQuery({
    queryKey: ['logoUrl', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage.from(LOGO_BUCKET).createSignedUrl(path as string, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
