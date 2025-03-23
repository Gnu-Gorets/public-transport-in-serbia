# Public transport in Serbia

## Local development

### Dockerless

1. Install nodejs and npm
2. `npm ci` in root of project
3. `npm run dev`
4. Check 127.0.0.1:3000

### Docker

1. `docker buildx build -t public-transport-in-serbia -f Dockerfile_local .` in / of project 
2. `docker run --name public-transport-in-serbia -p 3000:3000 -d public-transport-in-serbia`
3. Check 127.0.0.1:3000

## Docker container (from git master)

1. `docker buildx build -t public-transport-in-serbia -f Dockerfile .` in / of project 
2. `docker run --name public-transport-in-serbia -p 3000:3000 -d public-transport-in-serbia`
3. Check 127.0.0.1:3000
