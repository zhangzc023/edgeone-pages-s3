// 统一的代理配置：包含匹配模式和是否允许返回 HTML
const PROXY_CONFIG = [
    {pattern: /^(?:https?:\/\/)?github\.com.*$/i, allowHtml: false},
    {pattern: /^(?:https?:\/\/)?api\.github\.com.*$/i, allowHtml: false},
    {pattern: /^(?:https?:\/\/)?raw\.githubusercontent\.com.*$/i, allowHtml: false},
    {pattern: /^(?:https?:\/\/)?api\.telegram\.org.*$/i, allowHtml: false},
    {pattern: /^(?:https?:\/\/)?get\.docker\.com.*$/i, allowHtml: false},
    {pattern: /^(?:https?:\/\/)?api\.stack-auth\.com.*$/i, allowHtml: false},
    {pattern: /^(?:https?:\/\/)?1ed9db35e6ef06864313ed80fac99984\.r2\.cloudflarestorage\.com.*$/i, allowHtml: false},
];

function notFound(text) {
    return new Response(text || '404', {
        status: 404
    });
}

export async function onRequest({request}) {
    const url = new URL(request.url);

    let realUrl = null;
    let pHost = request.headers.get("p-host");
    let proxyUrl = url.pathname.slice(1);
    if (pHost) {
        proxyUrl = pHost + "/" + proxyUrl;
    }

    if (proxyUrl.search(/^https?:\/\//) !== 0) {
        proxyUrl = 'https://' + proxyUrl;
    }
    try {
        const parsedUrl = new URL(proxyUrl);
        const host = parsedUrl.hostname;

        // 查找匹配的代理配置
        const config = PROXY_CONFIG.find(cfg => cfg.pattern.test(host));
        if (!config) {
            return notFound();
        }

        realUrl = new URL(proxyUrl);
        realUrl.search = url.search;
        let headers = new Headers();
        headers.set('Host', realUrl.host);
        headers.set('Referer', realUrl.href);
        for (const [key, value] of request.headers.entries()) {
            if (['accept', 'accept-language', 'content-type'].includes(key.toLowerCase())) {
                headers.set(key, value);
            }
        }

        const response = await fetch(realUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
            redirect: 'follow'
        });

        let contentType = response.headers.get('content-type');

        // 检查是否允许返回 HTML
        if (contentType && contentType.includes('text/html') && !config.allowHtml) {
            return notFound();
        }

        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Access-Control-Allow-Origin', '*');
        return newResponse;
    } catch (error) {
        return new Response(error.message, {
            status: 500,
            headers: {'Content-Type': 'text/plain'}
        });
    }
}