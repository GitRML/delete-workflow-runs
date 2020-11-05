/**
 * Execute the main() function.
**/
main();


async function main() {
  const core = require("@actions/core");
  try {
    // Fetch all the inputs
    const token = core.getInput('token');
    const repository = core.getInput('repository');
    const retain_days = core.getInput('retain_days');
    const keep_minimum_runs = core.getInput('keep_minimum_runs');
    
    // Split the input 'repository' (format {owner}/{repo}) to be {owner} and {repo}
    const splitRepository = repository.split('/');
    if (splitRepository.length !== 2 || !splitRepository[0] || !splitRepository[1]) {
      throw new Error(`Invalid repository '${repository}'. Expected format {owner}/{repo}.`);
    }
    const repo_owner = splitRepository[0];
    const repo_name = splitRepository[1];
    
    // var page_number = 1;
    // var del_runs = new Array();
    const { Octokit } = require("@octokit/core");
    const octokit = new Octokit({ auth: token });

    const workflows_total_count = (await octokit.request('GET /repos/{owner}/{repo}/actions/workflows', {
      owner: repo_owner,
      repo: repo_name
    })).data.total_count;

    if (workflows_total_count > 0) {
      const workflows_total_pages = calc_pages(workflows_total_count);
      var workflows_page_number = 1;
      while (workflows_page_number <= workflows_total_pages) {
        const workflows_response = await octokit.request('GET /repos/{owner}/{repo}/actions/workflows', {
          owner: repo_owner,
          repo: repo_name,
          per_page: 100,
          page: workflows_page_number
        });

        const workflows_length = workflows_response.data.workflows.length;
        if (workflows_length > 0) {
          for (workflow_index = 0; workflow_index < workflows_length; workflow_index++) {
            const workflow_id = workflows_response.data.workflows[workflow_index].id;
            const workflow_name = workflows_response.data.workflows[workflow_index].name;
            const workflow_file = workflows_response.data.workflows[workflow_index].path;

            core.startGroup(`🔄 Dealing with workflow ${workflow_id}...`);
            console.log(`🔖 Workflow name: ${workflow_name}`);
            console.log(`📮 Workflow file: ${workflow_file}`);

            const runs_total_count = (await octokit.request('GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs', {
              owner: repo_owner,
              repo: repo_name,
              workflow_id: workflow_id
            })).data.total_count;

            if (runs_total_count > keep_minimum_runs) {
              var remain_runs = runs_total_count;
              const runs_total_pages = calc_pages(runs_total_count);
              var runs_page_number = runs_total_pages;
              while (runs_page_number > 0) {
                const runs_response = await octokit.request('GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs', {
                  owner: repo_owner,
                  repo: repo_name,
                  workflow_id: workflow_id,
                  per_page: 100,
                  page: runs_page_number
                });

                const runs_length = runs_response.data.workflow_runs.length;
                if (runs_length > 0) {
                  for (run_index = runs_length - 1; run_index >= 0; run_index--) {
                    const elapsed_days = cacl_elapsed_days(runs_response.data.workflow_runs[run_index].created_at);
                    if (elapsed_days >= retain_days) {
                      const run_id = runs_response.data.workflow_runs[run_index].id;
                      await octokit.request('DELETE /repos/{owner}/{repo}/actions/runs/{run_id}', {
                        owner: repo_owner,
                        repo: repo_name,
                        run_id: run_id
                      });
                      console.log(`🚀 Delete workflow run ${run_id}`);

                      remain_runs -= 1;
                      if (remain_runs = keep_minimum_runs) {
                        break;
                      }
                    }
                  }
                }

                if (remain_runs = keep_minimum_runs) {
                  break;
                }

                runs_page_number--;
              }
            }
            else {
              console.log(`✅ No runs need to be deleted for this workflow.`);
            }

            core.endGroup();
          }
        }

        workflows_page_number++;
      }
    }
    else {
      console.log(`✅ No workflow runs need to be deleted.`);
    }
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

/**
 * Define the calc_pages() function.
 * Calculate the total pages of 100 objects per page.
**/
function calc_pages(total_count) {
  const remainder = total_count % 100;
  
  var addition = 0;
  if (remainder > 0) {
    addition += 1
  }
  
  const divisor = total_count - remainder;
  const quotient = divisor / 100;
  const total_page = quotient + addition;
  return total_page;
}

/**
 * Define the cacl_elapsed_days() function.
 * Calculate the elapsed days from a specified date-time to current.
**/
function cacl_elapsed_days(start_datetime) {
  const start_at = new Date(start_datetime);
  const current = new Date();
  const elapsed_ms = current.getTime() - start_at.getTime();
  const elapsed_days = elapsed_ms / (1000 * 3600 * 24);
  return elapsed_days;
}