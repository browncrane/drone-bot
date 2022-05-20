const { exec } = require('node:child_process');
const core = require('@actions/core');
const github = require("@actions/github");
const axios = require("axios").default;
const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/"); // https://docs.github.com/en/actions/learn-github-actions/environment-variables#default-environment-variables

const head = "master";
const base = "development";
const label = "Hotfix-Helper: created";
const slackBots = process.env.SLACK_BOTS ? process.env.SLACK_BOTS.split(",") : []

const prBody = `
## Description

This pr was created by bot.

Hot-fix helper: Auto merge ${head} into ${base}. 

Hot-fix helper document: [[TMINFRA-390] Hotfix Helper - Automatic dev branch sync](https://docs.google.com/document/d/1_wFsIYgyxoI872mJt11ABXiqtAC7Yf9-iGBgSASmThM/edit#heading=h.bpbfc9v4qobe)

## Work Ticket

## Automated Testing
Check at least 1

- [x] Unit tests
- [x] e2e tests
- [ ] No automated testing is possible

## Test Plan

## Monitoring and Rollback Plan

## Screenshots

## Mandatory checklist to be completed by PR owner
- [x] Is this PR less than 400 lines of code (not counting tests)?
- [x] Did you check if this PR is risky and flag it if so?
- [x] Does this PR have a work ticket?
- [x] Is [Automated Testing](#Automated-Testing) filled out?
- [x] Is [Test Plan](#Test-Plan) filled out?
- [x] Did you check if [Monitoring and Rollback Plan](#Monitoring-and-Rollback-Plan) is applicable and fill it if so?
`;

function execCallback(error, stdout, stderr) {
    if (error) {
      console.error(`exec error: ${error}`);
      core.setFailed(error)
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  }

function sendSlackMsg(url, msg) {
    axios.post(
        url, 
        {
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "*Hot-fix Helper*",
                    },
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: msg
                    },
                },
            ],
        }
    );
}

async function autoCreatePr() {
    const { data: existsPrs } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: "open",
        head: `${owner}:${head}`,
        base,
    });
    if (existsPrs.length > 0) {
        console.log(
            `PR [${head}] -> [${base}] exists ${existsPrs.map(
                (pr) => pr.number
            )}, skip!`
        );
        return;
    }
    const { data: pr } = await octokit.rest.pulls.create({
        owner,
        repo,
        head,
        base,
        title: `HotFix Helper - Auto merge ${head} into ${base}`,
        body: prBody,
    });
    console.log(`Created new pr: ${pr.number}`);

    await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: [label],
    });
}

async function processFailurePr(pr) {
    console.log("add label [Hotfix-Helper: merge failed] to: ", pr.number);
    await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: ["Hotfix-Helper: merge failed"],
    });
    const { data: labels } = await octokit.rest.issues.listLabelsOnIssue({
        owner,
        repo,
        issue_number: pr.number,
    });
    const sentSlackLabel = "Hotfix-Helper: Sent Slack";
    console.log(`Pr labels is: ${labels.map(label => label.name)}`)
    const needNotifyFailure = labels.filter((label) => 
        label.name === sentSlackLabel
    ).length === 0

    if (needNotifyFailure) {
        console.log(`Notify Slack failure to ${slackBots}`);
        slackBots.forEach(bot => {
            sendSlackMsg(bot, `:cancel_allocation: Auto Merge <${pr.html_url}|PR ${pr.number}> failed. Please check. :pleading_face:`)
        })
        console.log(`Mark label of [${sentSlackLabel}]`);
        await octokit.rest.issues.addLabels({
            owner,
            repo,
            issue_number: pr.number,
            labels: [sentSlackLabel],
        });
    }
}

async function autoMergePr() {
    // https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests#search-only-issues-or-pull-requests
    const q = `is:pr is:open repo:${owner}/${repo} draft:false label:"${label}"`;
    const {
        data: { items: prs },
    } = await octokit.rest.search.issuesAndPullRequests({q});

    console.log(
        "filtered prs: ",
        prs.map((pr) => pr.number)
    );
    prs.forEach(async (pr) => {
        const { data: prDetail } = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: pr.number
        })
        let { data: { check_runs }} = await octokit.rest.checks.listForRef({
            owner, repo,
            ref: prDetail.head.sha
        })

        // check run may run multiple names with the same name
        // but we just care about the latest run
        let checkedNames = new Set()
        check_runs = check_runs.filter(run => {
            if (checkedNames.has(run.name)) {
                return false
            }
            checkedNames.add(run.name)
            return true
        })

        const existFailure = check_runs.filter(run => {
            console.log(`conclusion ${run.name} ${run.conclusion} ==> ${run.html_url}`)
            return run.conclusion === "failure"
        }).length > 0
        console.log("Exists failure check: ", existFailure)
        const existUncomplete = check_runs.filter(run => {
            console.log(`Status ${run.name} ${run.status} ==> ${run.html_url}`)
            return run.status !== "completed"
        }).length > 0
        console.log("Exists uncomplete check: ", existUncomplete)
        if (existFailure) {
            await processFailurePr(pr)
        } else if (!existUncomplete && !existFailure) {
            if (pr.changed_files >= 0) {
            console.log("Ready to merge: ", pr.number);
                exec(`git pull origin ${pr.base.ref}`, execCallback)
                exec(`git pull origin ${pr.head.ref}`, execCallback)
                exec(`git checkout ${pr.base.ref}`, execCallback)
                exec(`git merge ${pr.head.ref}`, execCallback)
                exec(`git push ${pr.base.ref}`, execCallback)
            }
            console.log("Ready to close: ", pr.number);
            const { data: closeResult } = await octokit.rest.pulls.update({
                owner,
                repo,
                pull_number: pr.number,
                state: "closed"
            });
            console.log(`Notify Slack merge success to ${slackBots}`);
            slackBots.forEach(bot => {
                sendSlackMsg(bot, `:white_check_mark: Auto Merged <${pr.html_url}|PR ${pr.number}>. :blob-clap::blob-clap::blob-clap:`)
            })
        }
    });
}

module.exports = {
    autoCreatePr,
    autoMergePr,
};
