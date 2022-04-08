local DRONE_BASE_IMAGE = "python:3.8.12-slim-buster";
local pull_drone_base(depends_on) = {
  "name": "pull_drone_base",
  "image": DRONE_BASE_IMAGE,
    "commands": [
      "exit 0", 
    ],
  "depends_on": depends_on
};
#above for mock

local auto_revert(branch, message_file, depends_on) = {
  "name": "auto_revert",
  "image": "alpine/git:latest",
  "environment": {
      "MESSAGE_FILE": message_file,
      "ssh_key": {
          "from_secret": "GITHUB_SSH_KEY"
      },
  },
  "commands": [
      "exit 0",
      "echo Trying to revert ${DRONE_COMMIT_AFTER} >> $${MESSAGE_FILE}",
      "git config --global --add url.\"git@github.com:\".insteadOf \"https://github.com/\"",
      "git revert -m 1 ${DRONE_COMMIT_AFTER}",
      "mkdir /root/.ssh",
      "ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts",
      "eval \"$(ssh-agent -s)\"",
      "ssh-add <(echo \"$ssh_key\")",
      "OUTPUT=$(git config pull.rebase false && git pull origin " +branch+ " && git push -u origin HEAD)",
      "echo \"${OUTPUT}\" >> $${MESSAGE_FILE}",
      "echo Success >> $${MESSAGE_FILE}"
  ],
  "depends_on": depends_on
};

[
# this for mock    
{
  "kind": "pipeline",
  "type": "docker",
  "name": "staging-infra-china",
  "trigger": {
    "event": [
      "pull_request"
    ],
    "branch": [
      "staging-infra-china"
    ],
  },
  "steps": [ 
    {
      "name": "e2e_test_staging",
      "image": DRONE_BASE_IMAGE,
      "commands": [
          "exit $((${DRONE_BUILD_NUMBER} % 3))",
      ],
    },     
  ]
},
# above for mock
{
  "kind": "pipeline",
  "type": "docker",
  "name": "auto-revert-broken-pr",
  "trigger": {
    "status" : [
      "failure"
    ],
    "event": [
      "push"
    ],
    "branch": [
      "staging-infra-china"
    ],
  },
  "workspace": {
    "path": "/app/src"
  },
  "steps": [
    pull_drone_base([]),
    {
      "name": "get_build_info",
      "image": DRONE_BASE_IMAGE,
      "environment": {
        "drone_token": {
          "from_secret": "DRONE_TOKEN"
        },
      },
      "commands": [
          "pip install requests",
          "python scripts/check_revert.py ${DRONE_BUILD_NUMBER} $drone_token",
      ],
      "depends_on": ["pull_drone_base"],
    },
    auto_revert("staging-infra-china", "./revert_check.txt", ["get_build_info"]) #,
    #slack_tm_eng_notification(CN_INFRA_SLACK_WEBHOOK, "auto-revert", "./revert_check.txt", ["auto_revert"]),
  ],
  "depends_on": [
    "staging-infra-china"
  ],
}
]
