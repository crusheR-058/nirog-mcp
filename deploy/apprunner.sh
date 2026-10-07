#!/usr/bin/env bash
# Build, push, and deploy nirog-mcp to AWS App Runner in Mumbai.
#   bash deploy/apprunner.sh            # create or update the service
# Needs: docker, aws cli, the roles from deploy/iam.sh, and NIROG_TOKEN_SECRET in .env (or the environment).
set -euo pipefail
cd "$(dirname "$0")/.."

export AWS_REGION=${AWS_REGION:-ap-south-1} AWS_DEFAULT_REGION=${AWS_REGION:-ap-south-1}
SERVICE=nirog-mcp
ACCT=$(aws sts get-caller-identity --query Account --output text)
REPO="$ACCT.dkr.ecr.$AWS_REGION.amazonaws.com/nirog-mcp"
TAG=$(git rev-parse --short HEAD)

[ -f .env ] && set -a && . ./.env && set +a
: "${NIROG_TOKEN_SECRET:?NIROG_TOKEN_SECRET must be set (in .env or the environment)}"

echo "building $REPO:$TAG"
docker build -q -t "$REPO:$TAG" -t "$REPO:latest" .
aws ecr get-login-password | docker login --username AWS --password-stdin "$ACCT.dkr.ecr.$AWS_REGION.amazonaws.com" >/dev/null
docker push -q "$REPO:$TAG"; docker push -q "$REPO:latest"

ACCESS_ROLE=$(aws iam get-role --role-name NirogAppRunnerECRAccessRole --query Role.Arn --output text)
INSTANCE_ROLE=$(aws iam get-role --role-name NirogMcpInstanceRole --query Role.Arn --output text)

# Runtime configuration. Memory and care-plan data default to the built-in demo set; point them at
# Supabase by adding MEMORY_STORE=pg, MEMORY_DATABASE_URL, NIROG_DATA_SOURCE=supabase, SUPABASE_URL, SUPABASE_SERVICE_KEY to .env.
env_json=$(node -e '
const keys = ["NIROG_TOKEN_SECRET","MEMORY_STORE","MEMORY_DATABASE_URL","MEMORY_PG_FLAVOUR","NIROG_DATA_SOURCE","SUPABASE_URL","SUPABASE_SERVICE_KEY","BEDROCK_CHAT_MODEL","BEDROCK_EMBED_MODEL"];
const env = { AWS_REGION: process.env.AWS_REGION, EMBEDDER: "bedrock", HOST: "0.0.0.0", PORT: "8080" };
for (const k of keys) if (process.env[k]) env[k] = process.env[k];
console.log(JSON.stringify(env));')

src=$(cat <<EOF
{"ImageRepository":{"ImageIdentifier":"$REPO:$TAG","ImageRepositoryType":"ECR",
  "ImageConfiguration":{"Port":"8080","RuntimeEnvironmentVariables":$env_json}},
 "AutoDeploymentsEnabled":false,
 "AuthenticationConfiguration":{"AccessRoleArn":"$ACCESS_ROLE"}}
EOF
)

ARN=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='$SERVICE'].ServiceArn | [0]" --output text)
if [ "$ARN" = "None" ] || [ -z "$ARN" ]; then
  echo "creating service"
  ARN=$(aws apprunner create-service --service-name "$SERVICE" \
    --source-configuration "$src" \
    --instance-configuration "{\"Cpu\":\"0.25 vCPU\",\"Memory\":\"0.5 GB\",\"InstanceRoleArn\":\"$INSTANCE_ROLE\"}" \
    --health-check-configuration '{"Protocol":"HTTP","Path":"/health","Interval":10,"Timeout":5,"HealthyThreshold":1,"UnhealthyThreshold":5}' \
    --query Service.ServiceArn --output text)
else
  echo "updating service"
  aws apprunner update-service --service-arn "$ARN" --source-configuration "$src" \
    --instance-configuration "{\"Cpu\":\"0.25 vCPU\",\"Memory\":\"0.5 GB\",\"InstanceRoleArn\":\"$INSTANCE_ROLE\"}" >/dev/null
fi

echo "waiting for RUNNING"
for _ in $(seq 1 60); do
  status=$(aws apprunner describe-service --service-arn "$ARN" --query Service.Status --output text)
  [ "$status" = "RUNNING" ] && break
  [ "$status" = "CREATE_FAILED" ] || [ "$status" = "UPDATE_FAILED" ] && { echo "deploy failed: $status"; exit 1; }
  sleep 10
done
URL=$(aws apprunner describe-service --service-arn "$ARN" --query Service.ServiceUrl --output text)
echo "status: $status"
echo "MCP endpoint: https://$URL/mcp"
curl -s "https://$URL/health"; echo
