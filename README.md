# critical-css-crawler
[![Docker Cloud Automated build](https://img.shields.io/docker/cloud/automated/zkchn/critical-css-crawler.svg)
![Docker Build Status](https://img.shields.io/docker/cloud/build/zkchn/critical-css-crawler.svg)](https://hub.docker.com/r/zkchn/critical-css-crawler)


## Requirments
* redis


## Installing
`docker run -p 3000:3000 zkchn/critical-css-crawler`
Docker-compose and k8s configrations can be found in this repo.
## Api
* `GET /healthz` - liveness probe
* `POST / body: {"url": "https://example.com", "headers": {"user-agent": "iPhone"}, "version": "1.0.0", "key": "/someurl"}` - `key` is optional, default value is `url`
Main entry point. It responses 404 when there are no critical css in a cache, and 200 with critical css in a body. After the first request
of page service starts preparing critical css. It takes about 7 seconds and then service starts serving styles.
  
## Integration with your site
TODO  
