import * as core from '@actions/core'
import * as github from '@actions/github'

import type {DeploymentStatus} from './types'

import {StatusError} from './custom-errors'
import {wait} from './wait'

interface Options {
  token: string
  owner: string
  repo: string
  deployment_id: number
}

const waitForDeploymentStatus = async (
  {token, owner, repo, deployment_id}: Options,
  MAX_TIMEOUT: number,
  ALLOW_INACTIVE: boolean
): Promise<DeploymentStatus | void> => {
  // Init a new octokit client
  const octokit = github.getOctokit(token)
  // Set the number of tries we are going to check for a deployment status
  const MAX_ITERATIONS = MAX_TIMEOUT / 2

  // Loop through the iterations
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    try {
      // Fetch statuses for a specific deployment
      const statuses = await octokit.repos.listDeploymentStatuses({
        owner,
        repo,
        deployment_id
      })

      // Pick out the latest deployment
      const status = statuses.data.length > 0 && statuses.data[0]

      // Handle the different type of scenarios, throwing a status leads to a new attempt
      if (!status) {
        throw new StatusError(
          `Found no status for current deployment, checking again in two seconds… (${i}/${MAX_ITERATIONS})`
        )
      } else if (
        status &&
        ALLOW_INACTIVE === true &&
        status.state === 'inactive'
      ) {
        core.info(
          'An inactive deployment was found and ALLOW_INACTIVE is set to "true", continuing…'
        )
        return status
      } else if (status && status.state === 'pending') {
        throw new StatusError(
          `Found a deployment with status "pending", checking again in two seconds… (${i}/${MAX_ITERATIONS})`
        )
      } else if (status && status.state === 'queued') {
        throw new StatusError(
          `Found a deployment with status "queued", checking again in two seconds… (${i}/${MAX_ITERATIONS})`
        )
      } else if (status && status.state === 'in_progress') {
        throw new StatusError(
          `Found a deployment with status "in_progress", checking again in two seconds… (${i}/${MAX_ITERATIONS})`
        )
      } else if (status && status.state === 'error') {
        core.setFailed('The deployment failed with an error, aborting…')
      } else if (status && status.state === 'failure') {
        core.setFailed('The deployment failed, aborting…')
      } else if (status && status.state === 'success') {
        core.info('A successful deployment was found, continuing…')
        return status
      } else {
        throw new StatusError('Unknown status error')
      }
    } catch (e) {
      if (e instanceof StatusError) {
        core.info(e.message)
      } else {
        core.error(e)
      }
      // Lets try again after two seconds
      await wait(2000)
    }
  }
  core.setFailed(`Timeout reached: Unable to find a successful deployment`)
}

export default waitForDeploymentStatus
