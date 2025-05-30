const PATTERNS = [
    // github
    /^(?:https?:\/\/)?github\.com.*$/i,
    /^(?:https?:\/\/)?api\.github\.com.*$/i,
    /^(?:https?:\/\/)?raw\.githubusercontent\.com.*$/i,
    // tgapi
    /^(?:https?:\/\/)?api\.telegram\.org.*$/i,
    /^(?:https?:\/\/)?get\.docker\.co.*$/i,
    /^(?:https?:\/\/)?file\.990223\.xyz.*$/i,
];

function checkUrl(url) {
    try {
        const parsed = new URL(url);
        return PATTERNS.some(pattern => pattern.test(parsed.hostname));
    } catch {
        return false;
    }
}

function notFound(text) {
    return new Response(text || '404', {
        status: 404
    });
}


export async function onRequest({request}) {
    const url = new URL(request.url);

    let realUrl = null;
    let pathname = url.pathname.slice(1);

    if (pathname.search(/^https?:\/\//) !== 0) {
        pathname = 'https://' + pathname;
    }
    if (!checkUrl(pathname)) {
        return notFound();
    }

    realUrl = new URL(pathname);
    realUrl.search = url.search;


    try {
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
            redirect: 'follow',
            cache: 'no-store' // 添加这行
        });
        let contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
            return notFound();
        }
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Access-Control-Allow-Origin', '*');
        newResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        newResponse.headers.set('Pragma', 'no-cache');
        newResponse.headers.set('Expires', '0');
        return newResponse;
    } catch (error) {
        return new Response(error.message, {
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

