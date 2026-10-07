#!/usr/bin/env bash
# One-time IAM setup for App Runner. Run once as an account admin:
#   bash deploy/iam.sh
# Creates two roles:
#   NirogAppRunnerECRAccessRole  lets App Runner pull the image from ECR
#   NirogMcpInstanceRole         lets the running service call Bedrock (and nothing else)
set -euo pipefail

tmp=$(mktemp -d)
cat > "$tmp/build-trust.json" <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF
cat > "$tmp/tasks-trust.json" <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"tasks.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF
cat > "$tmp/bedrock.json" <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream","bedrock:Converse","bedrock:ConverseStream"],"Resource":"*"}]}
EOF

if ! aws iam get-role --role-name NirogAppRunnerECRAccessRole >/dev/null 2>&1; then
  aws iam create-role --role-name NirogAppRunnerECRAccessRole \
    --assume-role-policy-document "file://$tmp/build-trust.json" --query Role.Arn --output text
  aws iam attach-role-policy --role-name NirogAppRunnerECRAccessRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
  echo "created NirogAppRunnerECRAccessRole"
else
  echo "NirogAppRunnerECRAccessRole exists"
fi

if ! aws iam get-role --role-name NirogMcpInstanceRole >/dev/null 2>&1; then
  aws iam create-role --role-name NirogMcpInstanceRole \
    --assume-role-policy-document "file://$tmp/tasks-trust.json" --query Role.Arn --output text
  aws iam put-role-policy --role-name NirogMcpInstanceRole --policy-name BedrockInvoke \
    --policy-document "file://$tmp/bedrock.json"
  echo "created NirogMcpInstanceRole"
else
  echo "NirogMcpInstanceRole exists"
fi

rm -rf "$tmp"
echo "done. Now: bash deploy/apprunner.sh"
