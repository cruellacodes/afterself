// ============================================================
// afterself-panic — API Client
// HTTP client for talking to the hosted afterself-panic server.
// Used by the CLI to upload pre-signed actions and manage them.
// ============================================================

export interface UploadActionPayload {
  label: string;
  codeHash: string;
  signedTx: string;
  nonceAccount: string;
  destination: string;
  amountLamports: number;
  asset: string;
  rpcUrl: string;
  createdAt: string;
  mode?: "wallet" | "cash";
  cashReceiverName?: string;
  cashCountry?: string;
  cashCurrency?: string;
}

export interface HostedActionSummary {
  label: string;
  destination: string;
  amount_lamports: number;
  asset: string;
  nonce_account: string;
  created_at: string;
}

async function apiRequest(
  method: string,
  url: string,
  token?: string,
  body?: unknown
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    throw new Error((data as any).error || `HTTP ${res.status}`);
  }
  return data;
}

export async function registerPhone(
  apiUrl: string,
  phoneHash: string
): Promise<{ token: string }> {
  return apiRequest("POST", `${apiUrl}/api/register`, undefined, {
    phone_hash: phoneHash,
  }) as Promise<{ token: string }>;
}

export async function uploadAction(
  apiUrl: string,
  token: string,
  action: UploadActionPayload
): Promise<void> {
  await apiRequest("POST", `${apiUrl}/api/actions`, token, {
    label: action.label,
    code_hash: action.codeHash,
    signed_tx: action.signedTx,
    nonce_account: action.nonceAccount,
    destination: action.destination,
    amount_lamports: action.amountLamports,
    asset: action.asset,
    rpc_url: action.rpcUrl,
    mode: action.mode || "wallet",
    cash_receiver_name: action.cashReceiverName || null,
    cash_country: action.cashCountry || null,
    cash_currency: action.cashCurrency || null,
  });
}

export async function deleteAction(
  apiUrl: string,
  token: string,
  label: string
): Promise<void> {
  await apiRequest(
    "DELETE",
    `${apiUrl}/api/actions/${encodeURIComponent(label)}`,
    token
  );
}

export async function deleteAllActions(
  apiUrl: string,
  token: string
): Promise<void> {
  await apiRequest("DELETE", `${apiUrl}/api/actions`, token);
}

export async function listHostedActions(
  apiUrl: string,
  token: string
): Promise<HostedActionSummary[]> {
  const data = await apiRequest("GET", `${apiUrl}/api/actions`, token);
  return (data as any).data || [];
}
