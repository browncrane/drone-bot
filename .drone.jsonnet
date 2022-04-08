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
local slack_auto_revert_notification(webhook, depends_on) = {
  "name": "slack_auto_revert_notification",
  "image": DRONE_BASE_IMAGE,
  "environment": {
    "SLACK_WEBHOOK": webhook,
  },
  "commands": [
    "exit 0",
  ],
  "depends_on": depends_on
};

local auto_revert(branch, depends_on) = {
  "name": "auto_revert",
  "image": "alpine/git:latest",
  "environment": {
      "ssh_key": {
          "from_secret": "GITHUB_SSH_KEY"
      },
  },
  "commands": [
      "exit 0",
      "git config --global --add url.\"git@github.com:\".insteadOf \"https://github.com/\"",
      "git revert -m 1 ${DRONE_COMMIT_AFTER}",
      "mkdir /root/.ssh",
      "ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts",
      "eval \"$(ssh-agent -s)\"",
      "ssh-add <(echo \"$ssh_key\")",
      "git config pull.rebase false && git pull origin " +branch+ " && git push -u origin HEAD",
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
      "push"
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
//   "volumes": [
//     {
//       "name": "docker_socket",
//       "host": {
//         "path": "/var/run/docker.sock"
//       }
//     }
//   ],
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
    slack_auto_revert_notification("FAKE_WEB_HOOK", ["get_build_info"]),
    auto_revert("staging-infra-china", ["slack_auto_revert_notification"]),
  ],
  "depends_on": [
    "staging-infra-china"
  ],
}
]
