# exit(78)  ref: https://discourse.drone.io/t/how-to-exit-a-pipeline-early-without-failing/3951

import sys

import requests

DRONE_REPO = "browncrane/drone-bot"
# for mock
DRONE_SERVER = "https://drone.glid.to"
REVERT_CHECK_LIST = ["e2e_test_staging"]
TARGET_BRANCH = "staging-infra-china"
# DRONE_REPO = "UrbanCompass/glide-devapp"

def check_revert(build_num, token):
    drone_headers = {"Authorization": f"Bearer {token}"}
    build_info_list = requests.get(
        url=f"{DRONE_SERVER}/api/repos/{DRONE_REPO}/builds", headers=drone_headers
    ).json()
    build_info = requests.get(
        url=f"{DRONE_SERVER}/api/repos/{DRONE_REPO}/builds/{build_num}",
        headers=drone_headers,
    ).json()

    if is_previous_related_build_fail(build_info_list, build_info.get("started")):
        print("previous related build fail, wouldn't revert")
        exit(78)

    if check_status(build_info):
        print("fail in revert check list, starting revert")
        exit(0)
    print("No fail in revert check list, wouldn't revert")
    exit(78)


def is_previous_related_build_fail(build_info_list, due_time):
    minimal_time_diff = due_time
    status = ""
    for build_info in build_info_list:
        if build_info.get("target") == TARGET_BRANCH and build_is_finished(build_info):
            current_diff = due_time - build_info.get("finished")
            if 0 < current_diff < minimal_time_diff:
                minimal_time_diff = current_diff
                status = build_info.get("status")
    return status == "failure"


def build_is_finished(build_info):
    return build_info.get("status") != "running" and build_info.get("finished") != 0


def check_status(build_info):
    if build_info.get("stages"):
        build_stage = build_info["stages"][0]
        for step in build_stage.get("steps"):
            if step.get("status") == "failure" and step.get("name") in REVERT_CHECK_LIST:
                return True
    return False


if __name__ == "__main__":
    check_revert(sys.argv[1], sys.argv[2])