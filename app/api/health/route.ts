export function GET() {
  return Response.json({ status: "ok", service: "flyrank-fashion-store", timestamp: new Date().toISOString() });
}
