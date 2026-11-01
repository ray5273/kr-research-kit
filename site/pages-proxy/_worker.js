// Keep the original URL, Origin header, cookies and request body intact.
// The bound Worker handles content, consent analytics and administrator auth.
export default {
  async fetch(request, env) {
    const response = await env.RESEARCH.fetch(request);
    if (new URL(request.url).hostname === "kr-research-site.pages.dev") return response;
    // Deployment and branch previews must not compete with the public URL.
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
