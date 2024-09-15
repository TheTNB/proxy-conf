const hub_host = 'registry-1.docker.io'
const auth_url = 'https://auth.docker.io'
const workers_url = 'https://hub.rat.dev'

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const getReqHeader = (key) => request.headers.get(key);

    if (url.pathname === '/') {
      return index();
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
      return fetch(new Request(token_url, request), token_parameter)
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
      redirect: 'follow',
      cf: {
        cacheTtlByStatus: { "200-299": 2592000, "404": 10, "500-599": 3 }
      },
    };

    if (request.headers.has("Authorization")) {
      parameter.headers.Authorization = getReqHeader("Authorization");
    }

    let res = await fetch(new Request(url, request), parameter)
    res = new Response(res.body, res)

    if (res.headers.has("Www-Authenticate")) {
      let auth = res.headers.get("Www-Authenticate");
      let re = new RegExp(auth_url, 'g');
      res.headers.set("Www-Authenticate", res.headers.get("Www-Authenticate").replace(re, workers_url));
    }

    return res;
  },
};

async function index() {
  return new Response(
    `<html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
        <p>
          由
          <a target="_blank" href="https://github.com/TheTNB/panel">耗子面板</a>
          强力驱动
        </p>
        <p id="cf"></p>
      </div>
      <script>
        async function updateCloudflareInfo() {
          try {
            const response = await fetch("/cdn-cgi/trace");
            if (response.ok) {
              const data = await response.text();
              const lines = data.split("\\n");
              const info = {};
              lines.forEach((line) => {
                const parts = line.split("=");
                if (parts.length === 2) {
                  info[parts[0]] = parts[1];
                }
              });
              const cfElement = document.getElementById("cf");
              const displayText =
                info.loc +
                " " +
                info.ip +
                " | " +
                info.colo +
                " | " +
                info.http +
                " | " +
                info.visit_scheme +
                " | " +
                info.tls +
                " | " +
                info.kex;
              cfElement.textContent = displayText;
            }
          } catch (error) {
            console.error("获取Cloudflare节点信息失败: ", error);
          }
        }
        window.addEventListener("load", updateCloudflareInfo);
      </script>
    </body>
</html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
