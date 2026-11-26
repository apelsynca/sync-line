export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function request(
  url: string,
  method = "GET",
  body?: object,
  timeout = 15000,
) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: body && { "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok)
    throw new RequestError(response.status, await response.text());
  return response;
}
