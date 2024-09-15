const hub_host = 'registry-1.docker.io'
const auth_url = 'https://auth.docker.io'
const workers_url = 'https://hub.rat.dev'

const PREFLIGHT_INIT = {
    status: 204,
    headers: new Headers({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
    }),
}

/**
 * @param {any} body
 * @param {number} status
 * @param {Object<string, string>} headers
 */
function makeRes(body, status = 200, headers = {}) {
    headers['access-control-allow-origin'] = '*'
    return new Response(body, { status, headers })
}


/**
 * @param {string} urlStr
 */
function newUrl(urlStr) {
    try {
        return new URL(urlStr)
    } catch (err) {
        return null
    }
}


addEventListener('fetch', e => {
    const ret = fetchHandler(e)
        .catch(err => makeRes('cfworker error:\n' + err.stack, 502))
    e.respondWith(ret)
})


/**
 * @param {FetchEvent} e
 */
async function fetchHandler(e) {
    const getReqHeader = (key) => e.request.headers.get(key);

    let url = new URL(e.request.url);

    if (url.pathname === '/') {
        return makeRes(index, 200, {
            'content-type': 'text/html'
        });
    }

    if (url.pathname === '/token') {
        let token_parameter = {
            headers: {
                'Host': 'auth.docker.io',
                'User-Agent': getReqHeader("User-Agent"),
                'Accept': getReqHeader("Accept"),
                'Accept-Language': getReqHeader("Accept-Language"),
                'Accept-Encoding': getReqHeader("Accept-Encoding"),
                'Connection': 'keep-alive',
                'Cache-Control': 'max-age=0'
            }
        };
        let token_url = auth_url + url.pathname + url.search
        return fetch(new Request(token_url, e.request), token_parameter)
    }

    url.hostname = hub_host;

    let parameter = {
        headers: {
            'Host': hub_host,
            'User-Agent': getReqHeader("User-Agent"),
            'Accept': getReqHeader("Accept"),
            'Accept-Language': getReqHeader("Accept-Language"),
            'Accept-Encoding': getReqHeader("Accept-Encoding"),
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0'
        },
        cacheTtl: 86400
    };

    if (e.request.headers.has("Authorization")) {
        parameter.headers.Authorization = getReqHeader("Authorization");
    }

    let original_response = await fetch(new Request(url, e.request), parameter)
    let original_response_clone = original_response.clone();
    let original_text = original_response_clone.body;
    let response_headers = original_response.headers;
    let new_response_headers = new Headers(response_headers);
    let status = original_response.status;

    if (new_response_headers.get("Www-Authenticate")) {
        let auth = new_response_headers.get("Www-Authenticate");
        let re = new RegExp(auth_url, 'g');
        new_response_headers.set("Www-Authenticate", response_headers.get("Www-Authenticate").replace(re, workers_url));
    }

    if (new_response_headers.get("Location")) {
        return httpHandler(e.request, new_response_headers.get("Location"))
    }

    let response = new Response(original_text, {
        status,
        headers: new_response_headers
    })

    return response;
}


/**
 * @param {Request} req
 * @param {string} pathname
 */
function httpHandler(req, pathname) {
    const reqHdrRaw = req.headers

    // preflight
    if (req.method === 'OPTIONS' &&
        reqHdrRaw.has('access-control-request-headers')
    ) {
        return new Response(null, PREFLIGHT_INIT)
    }

    let rawLen = ''

    const reqHdrNew = new Headers(reqHdrRaw)

    const refer = reqHdrNew.get('referer')

    let urlStr = pathname

    const urlObj = newUrl(urlStr)

    /** @type {RequestInit} */
    const reqInit = {
        method: req.method,
        headers: reqHdrNew,
        redirect: 'follow',
        cf: {
            polish: "lossless",
            cacheTtl: 86400,
        },
        body: req.body
    }
    return proxy(urlObj, reqInit, rawLen)
}


/**
 *
 * @param {URL} urlObj
 * @param {RequestInit} reqInit
 */
async function proxy(urlObj, reqInit, rawLen) {
    const res = await fetch(urlObj.href, reqInit)
    const resHdrOld = res.headers
    const resHdrNew = new Headers(resHdrOld)

    // verify
    if (rawLen) {
        const newLen = resHdrOld.get('content-length') || ''
        const badLen = (rawLen !== newLen)

        if (badLen) {
            return makeRes(res.body, 400, {
                '--error': `bad len: ${newLen}, except: ${rawLen}`,
                'access-control-expose-headers': '--error',
            })
        }
    }
    const status = res.status
    resHdrNew.set('access-control-expose-headers', '*')
    resHdrNew.set('access-control-allow-origin', '*')
    resHdrNew.set('cache-control', 'max-age=1800')

    resHdrNew.delete('content-security-policy')
    resHdrNew.delete('content-security-policy-report-only')
    resHdrNew.delete('clear-site-data')

    return new Response(res.body, {
        status,
        headers: resHdrNew
    })
}

const index = `
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hub Proxy</title>
    <style>
        body {
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 800px;
            margin: 2em auto;
            background-color: #ffffff;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        h1 {
            font-size: 2.5em;
            margin-top: 0;
            margin-bottom: 20px;
            text-align: center;
            color: #333;
            border-bottom: 2px solid #ddd;
            padding-bottom: 0.5em;
        }
        p {
            color: #555;
            line-height: 1.8;
            text-align: center;
        }
        a {
            text-decoration: none;
            color: #007bff;
        }
        @media screen and (max-width: 768px) {
            .container {
                padding: 15px;
                margin: 2em 15px;
            }
            h1 {
                font-size: 1.8em;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Hub Proxy</h1>
        <p>由 <a target="_blank" href="https://github.com/TheTNB/panel">耗子面板</a> 强力驱动</p>
        <p id="cf"></p>
    </div>
    <script>
    async function updateCloudflareInfo() {
        try {
            const response = await fetch('/cdn-cgi/trace');
            if (response.ok) {
                const data = await response.text();
                const lines = data.split('\\n');
                const info = {};
                lines.forEach(line => {
                    const parts = line.split('=');
                    if (parts.length === 2) {
                        info[parts[0]] = parts[1];
                    }
                });
                const cfElement = document.getElementById('cf');
                const displayText = info.loc + " " + info.ip + " | " + info.colo + " | " + info.http +
                                    " | " + info.visit_scheme + " | " + info.tls + " | " + info.kex;
                cfElement.textContent = displayText;
            }
        } catch (error) {
            console.error('获取Cloudflare节点信息失败: ', error);
        }
    }

    window.addEventListener('load', updateCloudflareInfo);
    </script>
</body>
</html>
`;
