import Vue from "vue";
import Vuex from "vuex";
import auth from "solid-auth-client";
import solidFileClient from "solid-file-client";
import axios from "axios";
import constants from "./constants";
import qs from "querystring";

const N3 = require("n3");
const df = N3.DataFactory;

const fc = new solidFileClient(auth);
const poc = "http://web.cmpe.boun.edu.tr/soslab/ontologies/poc#";
const dcterms = "http://purl.org/dc/terms/";
const rdfs = "http://www.w3.org/2000/01/rdf-schema#";
const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const applicationName = "storytelling"; // Application name, this is used to store the users in a graph named accordingly in the sparql server 
const appOntology = `http://web.cmpe.boun.edu.tr/soslab/ontologies/${applicationName}#`; // change to your application's uri 
const owl = "http://www.w3.org/2002/07/owl#";
const xsd = "http://www.w3.org/2001/XMLSchema#";
const vcard = "http://www.w3.org/2006/vcard/ns#";

const fusekiEndpoint = "http://134.122.65.239:3030"; // This is where the spec and users is stored actually 
const datasetName = "ds";
const specGraph = "http://poc.core"; // typically you do not need to change this
const groupURL = "https://serkanozel.me/pocUsers.ttl";

const addUsersGroupQuery = `
BASE <http://serkanozel.me/pocUsers.ttl>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX poc: <http://web.cmpe.boun.edu.tr/soslab/ontologies/poc#>
PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX acl:  <http://www.w3.org/ns/auth/acl#>

INSERT DATA {
GRAPH <http://${applicationName}.users> {
    <#poc> a                vcard:Group;
    vcard:hasUID     <urn:uuid:8831CBAD-1111-2222-8563-F0F4787E5398:ABGroup>;
    dc:created       "${new Date().toISOString()}"^^xsd:dateTime;
    dc:modified      "${new Date().toISOString()}"^^xsd:dateTime.
  }
}
`;

Vue.use(Vuex);

const generateRandomString = () => {
  return Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, "")
    .substr(0, 5);
};

export default new Vuex.Store({
  state: {
    loggedIn: false,
    user: "", // holds the webid of the user with card#me
    users: [],
    userRoot: "", // holds root hostname the webid of the user
    store: new N3.Store(), // holds the spec,
    compositeDatatypes: [],
    derivedDatatypes: [],
    workflows: [],
    workflowInstances: [],
    userWorkflowInstances: [],
    dataInstances: [],
    userDataInstances: [],
    lists: [],
    appUri: "",
    appDesc: "",
    fetching: true,
    execute: false,
    fc: null,
    halt: false
  },
  mutations: {
    login(state, { user }) {
      state.loggedIn = true;
      state.user = user;
    },
    setFetchingFalse(state) {
      state.fetching = false;
    },
    logout(state) {
      state.loggedIn = false;
    },
    updateUserRootUrl(state, { webId }) {
      const url = new URL(webId);
      state.userRoot = `${url.protocol}//${url.hostname}`;
    },
    updateUsers(state, { users }) {
      state.users = users;
    },
    addList(state, { list, listName }) {
      state.lists.push({ list: list, listName: listName });
    },
    addDataInstance(state, { dataInstance }) {
      console.log("Adding data instances");
      state.dataInstances.push(dataInstance);
    },
    addUserDataInstance(state, { userDataInstance }) {
      state.userDataInstances.push(userDataInstance);
    },
    addWorkflowInstance(state, { workflowInstance }) {
      state.workflowInstances.push(workflowInstance);
    },
    addUserWorkflowInstance(state, { workflowInstance }) {
      state.userWorkflowInstances.push(workflowInstance);
    },
    addQuad(state, { quad }) {
      state.store.addQuad(quad);
    },
    setAppUri(state, { appUri }) {
      state.appUri = appUri;
    },
    setAppDesc(state, { appDesc }) {
      state.appDesc = appDesc;
    },
    setCompositeDatatypes(state, { compositeDatatypes }) {
      state.compositeDatatypes = compositeDatatypes;
    },
    setDerivedDatatypes(state, { derivedDatatypes }) {
      state.derivedDatatypes = derivedDatatypes;
    },
    setWorkflows(state, { workflows }) {
      state.workflows = workflows;
    },
    setWorkflowInstances(state, { workflowInstances }) {
      state.workflowInstances = workflowInstances.sort((a, b) => new Date(a.modified) - new Date(b.modified));
    },
    setUserWorkflowInstances(state, { userWorkflowInstances }) {
      state.userWorkflowInstances = userWorkflowInstances.sort((a, b) => new Date(a.modified) - new Date(b.modified));
    },
    startExecution(state) {
      state.execute = true;
    },
    stopExecution(state) {
      state.execute = false;
    },
    halt(state) {
      state.halt = true;
    },
    continue(state) {
      state.halt = false;
    }
  },
  actions: {
    async init({ dispatch }, { vue }) {
      //#region  check if users graph exists in the fuseki database
      try {
        const res = await axios.get(groupURL);
        const miniStore = new N3.Store();
        const parser = new N3.Parser();
        parser.parse(res.data, async (err, quad, prefixes) => {
          if (quad) {
            miniStore.addQuad(quad);
          } else {
            if (miniStore.size == 0) {
              const data = {
                update: addUsersGroupQuery
              };
              try {
                const resp = await axios.post(fusekiEndpoint + `/${datasetName}/update`, qs.stringify(data));
              } catch (error) {
                vue.$bvToast.toast("An error occured while trying to create user group, check fuseki server is up");
              }
            }
            dispatch("checkLogin", { vue: vue });

          }
        });
      } catch (error) {
        vue.$bvToast.toast("Error while initialize " + JSON.stringify(error));
      }
      //#endregion
    },
    async login({ dispatch, commit }, { vue }) {
      let session = await auth.currentSession();
      if (!session) session = await auth.login("https://solid.community");
      const url = new URL(session.webId);
      commit("login", {
        user: session.webId,
      });
      dispatch("initializeUser", {
        rootURI: `${url.protocol}//${url.hostname}`,
        webId: session.webId,
        vue: vue
      });
    },
    async createWorkflowInstance({ state, dispatch, commit }, { workflowURI, userWebID, vue }) {
      //#region Create workflow instance, step instances, and control pipes of them in step instances
      vue.$bvToast.toast("Creating workflow instance..");
      if (!state.loggedIn) {
        vue.$bvToast.toast("You should be logged in to create workflow.");
        return;
      }
      const randomString = generateRandomString();
      const workflow_instance = constants.workflowInstanceTTL(
        workflowURI,
        userWebID,
        randomString
      );

      try {
        const res = await fc.postFile(
          state.userRoot +
          "/poc/workflow_instances/workflow_instance_" +
          randomString,
          workflow_instance,
          "text/turtle"
        );
        const res2 = await fc.createFolder(
          state.userRoot +
          "/poc/workflow_instances/" +
          `${randomString}_step_instances`
        );
        const stepsQuads = state.store.getQuads(df.namedNode(workflowURI), df.namedNode(poc + "step"), null);
        let promises = [];
        for (const q of stepsQuads) {
          const stepURI = q.object.value;
          const stepName = stepURI.substring(stepURI.lastIndexOf("#") + 1);
          const stepInstanceTTL = constants.stepInstanceTTL(stepURI, userWebID);

          promises.push(fc.postFile(
            state.userRoot +
            "/poc/workflow_instances/" +
            `${randomString}_step_instances/` + stepName + ".ttl",
            stepInstanceTTL,
            "text/turtle"
          ));
        }
        await Promise.all(promises);
        promises = [];
        const pipesQuads = state.store.getQuads(df.namedNode(workflowURI), df.namedNode(poc + "pipe"), null);
        const pipes = [];
        pipesQuads.forEach(el => {
          pipes.push(el.object.value);
        });

        for (const pipe of pipes) {
          //const isHuman = state.store.getQuads(df.namedNode(pipe), df.namedNode(rdf+"type"), df.namedNode(poc+"HumanPipe"));
          // const isDirect = state.store.getQuads(df.namedNode(pipe), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
          // const isPort = state.store.getQuads(df.namedNode(pipe), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));
          const isControl = state.store.getQuads(df.namedNode(pipe), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
          if (isControl.length > 0) {
            const pipeName = pipe.substring(pipe.lastIndexOf("#") + 1);
            promises.push(fc.postFile(
              state.userRoot +
              "/poc/workflow_instances/" +
              `${randomString}_step_instances/` + pipeName + ".ttl",
              "",
              "text/turtle"
            ));
          }
        }
        await Promise.all(promises);

        dispatch("executeWorkflowInstance", { workflowURI: workflowURI, workflowInstanceID: randomString, vue: vue });
        vue.$bvToast.toast("Workflow instance created! Its execution started!");
        const response = await fc.readFolder(`${state.userRoot}/poc/workflow_instances/`);
        response.files.forEach(f => {
          if (f.url == `${state.userRoot}/poc/workflow_instances/workflow_instance_${randomString}.ttl`) {
            commit("addUserWorkflowInstance", { workflowInstance: { ...f, datatype: workflowURI, needInput: false } });
          }
        });

      } catch (error) {
        vue.$bvToast.toast("Can't create workflow make sure to give permission to this website's url");
      }
      //#endregion
    },
    async executeWorkflowInstance({ state, dispatch, commit }, { workflowURI, workflowInstanceID, vue }) {

      //#region Check if workflow instance exists

      if (!(await fc.itemExists(state.userRoot + "/poc/workflow_instances/workflow_instance_" + workflowInstanceID + ".ttl"))) {// check if workflow exists
        vue.$bvToast.toast("Workflow instance not found while trying to execute it!");
        return;
      }
      //#endregion

      //#region Get all files inside step instances folder and return if human input is needed
      // sort the steps according to their dependencies and find a step that has zero dependency or only human pipes


      // get all files in step instances folder
      const res = await fc.readFolder(state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/");

      res.files.forEach(file => {
        // if there is a need for human input, return 
        if (file.url.includes("human_input")) {
          state.userWorkflowInstances.forEach(x => {
            if (x.url.includes(workflowInstanceID)) x.needInput = true;
          });
          vue.$bvToast.toast("The workflow instance with id " + workflowInstanceID + " needs your input to be able execute, please go to profile and enter the necessary inputs");
          return;
        }
      });
      //#endregion

      //#region Get all pipes in an array in own format 
      const pipeQuads = state.store.getQuads(df.namedNode(workflowURI), df.namedNode(poc + "pipe"), null);
      const pipes = []; // will hold all pipes in our data format
      pipeQuads.forEach(quad => {
        const uri = quad.object.value;
        const pipeName = uri.substring(uri.lastIndexOf("#") + 1);
        const isPipe = state.store.getQuads(df.namedNode(appOntology + pipeName), df.namedNode(rdf + "type"), df.namedNode(poc + "Pipe"));
        if (isPipe.length > 0) {
          const isHumanPipe = state.store.getQuads(df.namedNode(appOntology + pipeName), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
          const isPortPipe = state.store.getQuads(df.namedNode(appOntology + pipeName), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));
          const isControlPipe = state.store.getQuads(df.namedNode(appOntology + pipeName), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
          const isDirectPipe = state.store.getQuads(df.namedNode(appOntology + pipeName), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
          const targetStep = state.store.getQuads(df.namedNode(appOntology + pipeName), df.namedNode(poc + "targetStep"), null);
          if (targetStep.length == 0) {
            vue.$bvToast.toast("The pipe does not have a targetStep " + pipeName);
            return;
          }

          const pipe = {
            name: pipeName,
            step: targetStep[0].object.value
          };

          if (isHumanPipe.length > 0) {
            pipe.type = "human";
          } else if (isPortPipe.length > 0) {
            pipe.type = "port";
          } else if (isControlPipe.length > 0) {
            pipe.type = "control";
          } else if (isDirectPipe.length > 0) {
            pipe.type = "direct";
          } else {
            vue.$bvToast.toast("Warning! Pipe named " + pipeName + " is not human, port or control pipe. ");
            return;
          }
          pipes.push(pipe);
        }
      });
      //#endregion



      //#region Start execution loop 

      // stop when
      // 1. a human step needs to run, in this case create human_input_${stepName} file in the step instances folder.
      commit("startExecution");
      while (state.execute) {
        while (state.halt) {
          console.log("halting..");
          await new Promise(r => setTimeout(r, 1000));
        }
        //#region Count all steps human and execution dependencies
        const stepQuads = state.store.getQuads(df.namedNode(workflowURI), df.namedNode(poc + "step"), null);
        const steps = {};
        let promises = [];

        for (const s of stepQuads) {
          const getStep = async (resolve, reject) => {
            // check if step status is not completed before adding to steps that will be considered to run 
            const stepName = s.object.value.substring(s.object.value.lastIndexOf("#") + 1);
            const res = await fc.readFile(state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + stepName + ".ttl");
            const miniStore = new N3.Store();
            const parser = new N3.Parser();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const status = miniStore.getQuads(null, df.namedNode(poc + "status"), null);
            if (status.length > 0) {
              const statusText = status[0].object.value;
              if (statusText != "completed") {
                steps[s.object.value] = {
                  humanDependency: 0,
                  executionDependency: 0
                };
              }
            } else {
              vue.$bvToast.toast(`Warning a step named ${s.object.value} in workflow instance ${workflowInstanceID} does not have status`);
              commit("stopExecution");
              return;
            }
            resolve();
          };
          promises.push(new Promise(getStep).catch(err => console.log(err)));
        }
        await Promise.all(promises);
        promises = [];
        for (const pipe of pipes) {
          const processPipe = async (resolve, reject) => {
            const targetPortQuad = state.store.getQuads(df.namedNode(appOntology + pipe.name), df.namedNode(poc + "targetPort"), null);

            if (pipe.type == "port" && pipe.step in steps) {
              const targetPortName = targetPortQuad[0].object.value.substring(targetPortQuad[0].object.value.lastIndexOf("#") + 1);
              if (!(await fc.itemExists(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetPortName}.ttl`))) {
                steps[pipe.step].executionDependency++;
              }
            } else if (pipe.type == "human" && pipe.step in steps) {
              steps[pipe.step].humanDependency++;
            } else if (pipe.type == "control" && pipe.step in steps) {

              if ((await fc.itemExists(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${pipe.name}.ttl`))) {
                steps[pipe.step].executionDependency++;
              }
            } else if (pipe.type != "direct" && pipe.step in steps) {
              vue.$bvToast.toast("Warning a pipe named " + pipe.name + " has a wrong type! Not port, human, direct and control");
            }
            resolve();
          };

          promises.push(new Promise(processPipe).catch(err => console.log(err)))
        }
        await Promise.all(promises);
        //#endregion

        // check if there is a step with no dependency and execute it

        if (Object.keys(steps).length === 0) {
          commit("stopExecution");
          //#region Mark the workflow as completed 
          const res = await fc.readFile(`${state.userRoot}/poc/workflow_instances/workflow_instance_${workflowInstanceID}.ttl`);
          const parser = new N3.Parser();
          const writer = new N3.Writer({
            prefixes: {
              poc: poc,
              dcterms: dcterms,
              rdf: rdf,
              xsd: xsd,
              rdfs: rdfs,
              owl: owl,
              appOntology: appOntology
            },
          });
          const quads = parser.parse(res);
          quads.forEach(q => {
            if (q.predicate.value == poc + "status") {
              writer.addQuad(q.subject, q.predicate, df.literal("completed", df.namedNode(xsd + "string")));
            } else {
              writer.addQuad(q);
            }
          });
          writer.end(async (err, res) => {
            await fc.deleteFile(`${state.userRoot}/poc/workflow_instances/workflow_instance_${workflowInstanceID}.ttl`);
            setTimeout(() => {
              location.reload();
            }, 1000);
          });
          vue.$bvToast.toast("Workflow completed!");

          return;
        }
        let stepToRun = "";
        for (let key in steps) {
          if (steps[key].humanDependency == 0 && steps[key].executionDependency == 0) {
            stepToRun = key;
            break;
          }
        }
        if (stepToRun == "") {
          for (let key in steps) {
            if (steps[key].executionDependency == 0) {
              stepToRun = key;
              break;
            }
          }
        }
        if (stepToRun == "") {
          vue.$bvToast.toast("Workflow is malformed as there are not any step to be able to run! Possibly there is a cycle in the workflow.");
          await fc.deleteFile(`${state.userRoot}/poc/workflow_instances/workflow_instance_${workflowInstanceID}.ttl`);
          setTimeout(() => {
            location.reload();
          }, 1000);
          commit("stopExecution");
          return;
        }
        // stepToRun holds step URI like appOntology:S0

        // continueExecution = false;

        if (steps[stepToRun].humanDependency == 0) {  // Execute the step right away
          await dispatch("executeStepInstance", { vue: vue, stepToRun: stepToRun, workflowURI: workflowURI, workflowInstanceID: workflowInstanceID });
        } else {
          state.userWorkflowInstances.forEach(x => {
            if (x.url.includes(workflowInstanceID)) x.needInput = true;
          });
          vue.$bvToast.toast("Your input is needed in order to continue this workflow. Please go to your profile page and add details.");
          const stepName = stepToRun.substring(stepToRun.lastIndexOf("#") + 1);
          await fc.postFile(state.userRoot + `/poc/workflow_instances/${workflowInstanceID}_step_instances/human_input_${stepName}.ttl`, "", "text/turtle");
          commit("stopExecution");
        }
      }
      //#endregion


    },
    async executeStepInstance({ state, dispatch, commit }, { vue, stepToRun, workflowInstanceID }) {
      //#region Find out which step to execute, get input and output ports in our own format
      const isCreateStep = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(rdf + "type"), df.namedNode(poc + "CreateStep"));
      const isDeleteStep = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(rdf + "type"), df.namedNode(poc + "DeleteStep"));
      const isDisplayStep = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(rdf + "type"), df.namedNode(poc + "DisplayStep"));
      const isEvaluateStep = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(rdf + "type"), df.namedNode(poc + "EvaluateStep"));
      const isFilterStep = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(rdf + "type"), df.namedNode(poc + "FilterStep"));
      const isGetStep = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(rdf + "type"), df.namedNode(poc + "GetStep"));
      const isInsertStep = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(rdf + "type"), df.namedNode(poc + "InsertStep"));
      const isModifyStep = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(rdf + "type"), df.namedNode(poc + "ModifyStep"));
      const isRemoveStep = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(rdf + "type"), df.namedNode(poc + "RemoveStep"));
      const isSaveStep = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(rdf + "type"), df.namedNode(poc + "SaveStep"));
      const isSizeStep = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(rdf + "type"), df.namedNode(poc + "SizeStep"));

      const stepName = stepToRun.substring(stepToRun.lastIndexOf("#") + 1);
      let inputPorts = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(poc + "inputPort"), null);
      let outputPorts = state.store.getQuads(df.namedNode(stepToRun), df.namedNode(poc + "outputPort"), null);
      let flag = 0;
      inputPorts = inputPorts.map(quad => {
        const labelQuad = state.store.getQuads(df.namedNode(quad.object.value), df.namedNode(rdfs + "label"), null);
        if (labelQuad.length == 0) {
          vue.$bvToast.toast("The input port " + quad.object.value.substring(quad.object.value.lastIndexOf("#") + 1) + " does not have a label!");
          flag = 1;
        }
        return {
          uri: quad.object.value,
          name: quad.object.value.substring(quad.object.value.lastIndexOf("#") + 1),
          label: labelQuad[0].object.value
        }
      });
      if (flag) return;
      outputPorts = outputPorts.map(quad => {
        const labelQuad = state.store.getQuads(df.namedNode(quad.object.value), df.namedNode(rdfs + "label"), null);
        if (labelQuad.length == 0) {
          vue.$bvToast.toast("The output port " + quad.object.value.substring(quad.object.value.lastIndexOf("#") + 1) + " does not have a label!");
          flag = 1;
        }
        return {
          uri: quad.object.value,
          name: quad.object.value.substring(quad.object.value.lastIndexOf("#") + 1),
          label: labelQuad[0].object.value
        }
      });
      if (flag) {
        commit("stopExecution");
        return;
      }
      //#endregion


      if (isCreateStep.length > 0) {
        await dispatch("executeCreateStep", { vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, inputPorts: inputPorts, outputPorts: outputPorts, stepToRun: stepToRun })
      }
      else if (isDeleteStep.length > 0) {
        await dispatch("executeDeleteStep", { vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, inputPorts: inputPorts, outputPorts: outputPorts, stepToRun: stepToRun })
      }
      else if (isDisplayStep.length > 0) {
        await dispatch("executeDisplayStep", { vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, inputPorts: inputPorts, outputPorts: outputPorts, stepToRun: stepToRun })
      }
      else if (isEvaluateStep.length > 0) {
        await dispatch("executeEvaluateStep", { vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, inputPorts: inputPorts, outputPorts: outputPorts, stepToRun: stepToRun })
      }
      else if (isFilterStep.length > 0) {
        await dispatch("executeFilterStep", { vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, inputPorts: inputPorts, outputPorts: outputPorts, stepToRun: stepToRun })
      }
      else if (isGetStep.length > 0) {
        await dispatch("executeGetStep", { vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, inputPorts: inputPorts, outputPorts: outputPorts, stepToRun: stepToRun })
      }
      else if (isInsertStep.length > 0) {
        await dispatch("executeInsertStep", { vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, inputPorts: inputPorts, outputPorts: outputPorts, stepToRun: stepToRun })
      }
      else if (isModifyStep.length > 0) {
        await dispatch("executeModifyStep", { vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, inputPorts: inputPorts, outputPorts: outputPorts, stepToRun: stepToRun })
      }
      else if (isRemoveStep.length > 0) {
        await dispatch("executeRemoveStep", { vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, inputPorts: inputPorts, outputPorts: outputPorts, stepToRun: stepToRun })
      }
      else if (isSaveStep.length > 0) {
        await dispatch("executeSaveStep", { vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, inputPorts: inputPorts, outputPorts: outputPorts, stepToRun: stepToRun })
      }
      else if (isSizeStep.length > 0) {
        await dispatch("executeSizeStep", { vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, inputPorts: inputPorts, outputPorts: outputPorts, stepToRun: stepToRun })
      }
      else {
        vue.$bvToast.toast("Invalid type for step instance " + stepToRun + " in workflow instance " + workflowInstanceID);
        commit("stopExecution");
        return;
      }

      //#region Mark the step as completed 
      const res = await fc.readFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${stepName}.ttl`);
      const parser = new N3.Parser();
      const writer = new N3.Writer({
        prefixes: {
          poc: poc,
          dcterms: dcterms,
          rdf: rdf,
          xsd: xsd,
          rdfs: rdfs,
          owl: owl,
          appOntology: appOntology
        },
      });
      let isCompleteAlready;
      const quads = parser.parse(res);
      quads.forEach(q => {
        if (q.predicate.value == poc + "status") {
          isCompleteAlready = q.object.value == "completed";
          writer.addQuad(q.subject, q.predicate, df.literal("completed", df.namedNode(xsd + "string")));
        } else {
          writer.addQuad(q);
        }
      });

      writer.end(async (err, res) => {
        await fc.createFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${stepName}.ttl`, res, "text/turtle");
      });
      if (!isCompleteAlready) vue.$bvToast.toast("The step " + stepName + " has been completed.");

      //#endregion
    },
    async fetchAllUsers({ state, commit }) {
      //#region  Updates all users info
      const res = await axios.get(groupURL);
      const parser = new N3.Parser({
        baseIRI: `http://serkanozel.me/pocUsers.ttl`,
      });
      parser.parse(res.data, (err, quad, prefixes) => {
        if (err) console.log(err);
        if (quad) {
          commit("addQuad", { quad: quad });
        } else {
          const userQuads = state.store.getQuads(
            df.namedNode(`http://serkanozel.me/pocUsers.ttl#poc`),
            df.namedNode(vcard + "hasMember")
          );
          commit("updateUsers", { users: userQuads });
        }
      });
      //#endregion
    },
    async initializeUser({ state, dispatch, commit }, { rootURI, webId, vue }) {
      commit("updateUserRootUrl", {
        webId: webId,
      });
      const rootACL = constants.rootACL(rootURI);


      //#region Create poc folder along with good permissions if not exists.
      try {
        if (!(await fc.itemExists(rootURI + "/poc/"))) {
          const res = await fc.createFolder(rootURI + "/poc/");
          const res2 = await fc.postFile(
            rootURI + "/poc/.acl",
            rootACL,
            "text/turtle"
          );
        }
      } catch (error) {
        vue.$bvToast.toast("Could not create poc folder in your solid pod make sure you give permission to the app while you login");
      }
      //#endregion
      //#region Bring all users info
      try {
        await dispatch("fetchAllUsers");
      } catch (error) {
        console.log(error);
        vue.$bvToast.toast(`Could not get all users info from group server`);
      }
      //#endregion
      //#region If the user is not in the poc group, add her

      let meIncluded = false;

      state.users.forEach(u => {
        if (u.object.value == webId) meIncluded = true;
      });
      if (!meIncluded) {
        try {

          const data = {
            update: `
            BASE <http://serkanozel.me/pocUsers.ttl>
            PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>

            INSERT DATA {
              <#poc> vcard:hasMember <${webId}>
            }
            `
          };
          await axios.post(
            fusekiEndpoint + `/${datasetName}/update`,
            qs.stringify(data),
            {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              }
            }
          );
        } catch (error) {
          vue.$bvToast.toast(`Cannot add user to poc list from fuseki server. Make sure fuseki server works`);
        }
      }
      //#endregion
      //#region Fetch specification info

      try {
        await dispatch("fetchSpec");
      } catch (error) {
        vue.$bvToast.toast(`Could not fetch specification info from ${fusekiEndpoint}/ds/query, make sure it is working`);
      }
      //#endregion
      //#region Write lists to user's pod

      let listQuads = state.store.getQuads(
        null,
        null,
        df.namedNode(poc + "List")
      );

      listQuads.forEach((x) => {
        const value = x.subject.value;
        const relatedQuads = state.store.getQuads(
          df.namedNode(x.subject.value),
          null,
          null
        );

        const writer = new N3.Writer({
          prefixes: {
            poc: poc,
            dcterms: dcterms,
            rdf: rdf,
            xsd: xsd,
            rdfs: rdfs,
            owl: owl,
            appOntology: appOntology
          },
        });
        writer.addQuads(relatedQuads);
        writer.addQuad(
          df.namedNode(x.subject.value),
          df.namedNode(dcterms + "created"),
          df.literal(
            new Date().toISOString(),
            df.namedNode(xsd + "datetime")
          )
        );
        writer.addQuad(
          df.namedNode(x.subject.value),
          df.namedNode(dcterms + "creator"),
          df.namedNode(state.user)
        );
        writer.addQuad(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "items"
          ),
          writer.list([])
        );
        writer.end(async (end, result) => {
          if (
            !(await fc.itemExists(
              rootURI +
              "/poc/data_instances/" +
              value.substring(value.lastIndexOf("#") + 1) +
              ".ttl"
            ))
          ) {
            await fc.createFile(
              rootURI +
              "/poc/data_instances/" +
              value.substring(value.lastIndexOf("#") + 1) +
              ".ttl",
              result,
              "text/turtle"
            );
          }
        });
      });
      //#endregion
      await Promise.all([dispatch("fetchAllWorkflowInstances", { vue: vue }), dispatch("fetchAllDataInstances"), dispatch("fetchAllLists")]);
      commit("setFetchingFalse");
    },
    async checkLogin({ commit, dispatch }, { vue }) {
      auth.trackSession((session) => {
        if (!session) {
          dispatch("login", { vue: vue });
        } else {
          const url = new URL(session.webId);
          commit("login", {
            user: session.webId,
          });
          dispatch("initializeUser", {
            rootURI: `${url.protocol}//${url.hostname}`,
            webId: session.webId,
            vue: vue
          });
        }
      });
    },
    async logoutAction({ commit }, { vue }) {
      try {
        await auth.logout();
        commit("logout");
      } catch (error) {
        vue.$bvToast.toast("Error while logout");
      }
    },
    async fetchSpec({ state, commit }) {
      //#region Make a get request to fuseki server
      const res = await axios.get(
        fusekiEndpoint + "/ds/query",
        {
          params: {
            query: `SELECT ?s ?p ?o WHERE { GRAPH<${specGraph}>{ ?s ?p ?o}}`,
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          }
        }
      );
      //#endregion
      //#region Preprocessing, from sparql endpoint result to store
      res.data.results.bindings.forEach((x) => {
        let s, p, o;
        if (x.s.type == "uri") {
          s = df.namedNode(x.s.value);
        } else if (x.s.type == "literal") {
          if (x.s.datatype) {
            s = df.literal(x.s.value, df.namedNode(x.s.datatype));
          } else if (x.s["xml:lang"]) {
            s = df.literal(x.s.value, x.s["xml:lang"]);
          } else {
            s = df.literal(x.s.value);
          }
        } else if (x.s.type == "bnode") {
          s = df.blankNode(x.s.value);
        }
        if (x.p.type == "uri") {
          p = df.namedNode(x.p.value);
        } else if (x.p.type == "literal") {
          if (x.p.datatype) {
            p = df.literal(x.p.value, df.namedNode(x.p.datatype));
          } else if (x.p["xml:lang"]) {
            p = df.literal(x.p.value, x.p["xml:lang"]);
          } else {
            p = df.literal(x.p.value);
          }
        } else if (x.p.type == "bnode") {
          p = df.blankNode(x.p.value);
        }
        if (x.o.type == "uri") {
          o = df.namedNode(x.o.value);
        } else if (x.o.type == "literal") {
          if (x.o.datatype) {
            o = df.literal(x.o.value, df.namedNode(x.o.datatype));
          } else if (x.o["xml:lang"]) {
            o = df.literal(x.o.value, x.o["xml:lang"]);
          } else {
            o = df.literal(x.o.value);
          }
        } else if (x.o.type == "bnode") {
          o = df.blankNode(x.o.value);
        }
        const quad = df.quad(s, p, o);
        commit("addQuad", { quad: quad });
      });
      //#endregion
      //#region Extract application name and description
      const ontologyQuad = state.store.getQuads(
        null,
        null,
        df.namedNode(owl + "Ontology")
      );
      if (ontologyQuad.length > 0) {
        commit("setAppUri", { appUri: ontologyQuad[0].subject.value });
        const ontologyCommentQuad = state.store.getQuads(
          df.namedNode(state.appUri),
          df.namedNode(rdfs + "comment"),
          null
        );
        commit("setAppDesc", {
          appDesc: ontologyCommentQuad.length > 0
            ? ontologyCommentQuad[0].object.value
            : ""
        })
      }
      //#endregion
      //#region Composite Datatype Extraction
      let compositeDatatypeQuads = state.store.getQuads(
        null,
        null,
        df.namedNode(
          poc + "CompositeDatatype"
        )
      );

      compositeDatatypeQuads = compositeDatatypeQuads.map((x) => {
        let dataFields = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "dataField"
          ),
          null
        );
        dataFields = dataFields.map((y) => {
          const fieldTypeQuad = state.store.getQuads(
            df.namedNode(y.object.value),
            df.namedNode(
              poc + "fieldType"
            ),
            null
          );
          const descriptionQuad = state.store.getQuads(
            df.namedNode(y.object.value),
            df.namedNode(dcterms + "description"),
            null
          );
          return {
            name: y.object.value,
            fieldtype:
              fieldTypeQuad.length > 0 ? fieldTypeQuad[0].object.value : "",
            description:
              descriptionQuad.length > 0 ? descriptionQuad[0].object.value : "",
          };
        });
        return {
          uri: x.subject.value,
          datafields: dataFields,
        };
      });
      commit("setCompositeDatatypes", { compositeDatatypes: compositeDatatypeQuads });
      //#endregion
      //#region Derived Datatypes Extraction
      let derivedDatatypeQuads = state.store.getQuads(
        null,
        null,
        df.namedNode(
          poc + "DerivedDatatype"
        )
      );
      derivedDatatypeQuads = derivedDatatypeQuads.map((x) => {
        const baseDatatypeQuad = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "baseDatatype"
          ),
          null
        );
        const maxFrameWidth = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "maxFrameWidth"
          ),
          null
        );
        const minFrameWidth = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "minFrameWidth"
          ),
          null
        );
        const maxFrameHeight = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "maxFrameHeight"
          ),
          null
        );
        const minFrameHeight = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "minFrameHeight"
          ),
          null
        );
        const maxTrackLength = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "maxTrackLength"
          ),
          null
        );
        const minTrackLength = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "minTrackLength"
          ),
          null
        );
        const maxFileSize = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "maxFileSize"
          ),
          null
        );
        const minFileSize = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "minFileSize"
          ),
          null
        );
        const scaleWidth = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "scaleWidth"
          ),
          null
        );
        const scaleHeight = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "scaleHeight"
          ),
          null
        );
        const maxSize = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(
            poc + "maxSize"
          ),
          null
        );

        return {
          uri: x.subject.value,
          baseDatatype:
            baseDatatypeQuad.length > 0 ? baseDatatypeQuad[0].object.value : "",
          limitations: {
            maxFrameWidth:
              maxFrameWidth.length > 0 ? maxFrameWidth[0].object.value : "",
            minFrameWidth:
              minFrameWidth.length > 0 ? minFrameWidth[0].object.value : "",
            maxFrameHeight:
              maxFrameHeight.length > 0 ? maxFrameHeight[0].object.value : "",
            minFrameHeight:
              minFrameHeight.length > 0 ? minFrameHeight[0].object.value : "",
            maxTrackLength:
              maxTrackLength.length > 0 ? maxTrackLength[0].object.value : "",
            minTrackLength:
              minTrackLength.length > 0 ? minTrackLength[0].object.value : "",
            maxFileSize:
              maxFileSize.length > 0 ? maxFileSize[0].object.value : "",
            minFileSize:
              minFileSize.length > 0 ? minFileSize[0].object.value : "",
            scaleWidth: scaleWidth.length > 0 ? scaleWidth[0].object.value : "",
            scaleHeight:
              scaleHeight.length > 0 ? scaleHeight[0].object.value : "",
            maxSize: maxSize.length > 0 ? maxSize[0].object.value : "",
          },
        };
      });
      commit("setDerivedDatatypes", { derivedDatatypes: derivedDatatypeQuads });
      //#endregion
      //#region Workflows Extraction
      let workflowQuads = state.store.getQuads(
        null,
        null,
        df.namedNode(
          "http://web.cmpe.boun.edu.tr/soslab/ontologies/poc#Workflow"
        )
      );
      workflowQuads = workflowQuads.map((x) => {
        const labelQuad = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(rdfs + "label"),
          null
        );
        const descriptionQuad = state.store.getQuads(
          df.namedNode(x.subject.value),
          df.namedNode(dcterms + "description"),
          null
        );
        return {
          uri: x.subject.value,
          description:
            descriptionQuad.length > 0 ? descriptionQuad[0].object.value : "",
          label: labelQuad.length > 0 ? labelQuad[0].object.value : "",
        };
      });
      commit("setWorkflows", { workflows: workflowQuads });
      //#endregion
    },
    async deleteUserInfo({ state }, { vue }) {

      try {
        await fc.deleteFolder(state.userRoot + "/poc/");
        vue.$bvToast.toast("All user info deleted");
      } catch (error) {
        vue.$bvToast.toast("Cannot delete user info");
      }
      setTimeout(() => {
        location.reload();
      }, 1000);
    },
    async deleteAllWorkflowInstances({ state }, { vue }) {

      try {
        await fc.deleteFolder(state.userRoot + "/poc/workflow_instances/");
        vue.$bvToast.toast("All user workflow instances deleted");
      } catch (error) {
        vue.$bvToast.toast("Cannot delete user workflow instances");
      }
      setTimeout(() => {
        location.reload();
      }, 1000);
    },
    async deleteAllDataInstances({ state }, { vue }) {

      try {
        await fc.deleteFolder(state.userRoot + "/poc/data_instances/");
        vue.$bvToast.toast("All user data instances deleted");
      } catch (error) {
        vue.$bvToast.toast("Cannot delete user data instances");
      }
      setTimeout(() => {
        location.reload();
      }, 1000);
    },
    async workflowInstanceStatus({ state, dispatch, commit }, { vue, workflowInstanceFileUrl, workflowURI }) {
      let datatypePortURI;
      let objectPortURI;
      let humanInputPortURI;
      let indexPortURI;
      let sourcePortURI;
      let inputPortQuads;
      let stepName;
      let isGetStep;
      let isCreateStep;
      let randomString;
      let datatypePortName;
      let datatype;
      let humanInputFileURL;
      let listUri;

      //#region Get workflow id, read step instances folder of it 

      randomString = workflowInstanceFileUrl
        .substring(workflowInstanceFileUrl.lastIndexOf("/") + 1)
        .substring(
          0,
          workflowInstanceFileUrl.substring(
            workflowInstanceFileUrl.lastIndexOf("/")
          ).length - 5
        )
        .substring(18);
      const res = await fc.readFolder(
        state.userRoot +
        "/poc/workflow_instances/" +
        randomString +
        "_step_instances/"
      );

      //#endregion
      //#region Find step name by finding the file with name human input in it
      res.files.forEach(file => {
        if (file.url.substring(file.url.lastIndexOf("/") + 1).startsWith("human_input")) { // If human input needed
          stepName = file.url.substring(file.url.lastIndexOf("/") + 1).substring(12).substring(0, file.url.substring(file.url.lastIndexOf("/") + 1).substring(12).length - 4);
          humanInputFileURL = file.url;
        }
      });
      //#endregion
      //#region Output status to user 
      if (stepName) {
        vue.$bvToast.toast("Your input is needed on step " + stepName);
        state.userWorkflowInstances.forEach(x => {
          if (x.url.includes(randomString)) x.needInput = true;
        })
      }
      else {
        const res = await fc.readFile(workflowInstanceFileUrl);
        const parser = new N3.Parser();
        const quads = parser.parse(res);
        const miniStore = new N3.Store();
        miniStore.addQuads(quads);
        const statusQuad = miniStore.getQuads(null, df.namedNode(poc + "status"), null);
        if (statusQuad.length == 0) {
          vue.$bvToast.toast(`The workflow instance ${workflowInstanceFileUrl} does not have a status!`);
          return;
        }
        if (statusQuad[0].object.value != "completed") {
          vue.$bvToast.toast("The workflow instance is not finished and no human input needed. This is not good! ");
          setTimeout(() => {
            location.reload();
          }, 1000);
          await fc.deleteFile(`${state.userRoot}/poc/workflow_instances/workflow_instance_${randomString}.ttl`);
          return;
        } else {
          vue.$bvToast.toast("The workflow instance has finished.")
          return;
        }
      }
      //#endregion
      //#region Retrieve input ports, if there is a human pipe going into it save the port uri
      inputPortQuads = state.store.getQuads(
        df.namedNode(appOntology + stepName),
        df.namedNode(poc + "inputPort"),
        null
      );

      inputPortQuads.forEach(quad => {
        const pipeTargetsThisPort = state.store.getQuads(
          null,
          df.namedNode(poc + "targetPort"),
          df.namedNode(quad.object.value)
        );
        if (pipeTargetsThisPort.length == 0) {
          vue.$bvToast.toast(`An inputport ${quad.object.value} does not have a pipe in this workflow instance`);
          return;
        }
        const pipeURI = pipeTargetsThisPort[0].subject.value;
        const isHumanPipe = state.store.getQuads(
          df.namedNode(pipeURI),
          df.namedNode(rdf + "type"),
          df.namedNode(poc + "HumanPipe")
        );
        if (isHumanPipe.length > 0) {
          humanInputPortURI = quad.object.value;
        }
      });
      //#endregion
      //#region Determine if step is get or create step

      // So there will be two cases: selecting index for a list, and creating a new object
      // Create dynamic modals in vue bootstrap according to input needed
      // * A CreateStep and GetStep must explain what they want from user by their rdfs:comment annotation.
      isGetStep = state.store.getQuads(
        df.namedNode(appOntology + stepName),
        df.namedNode(rdf + "type"),
        df.namedNode(poc + "GetStep")
      );
      isCreateStep = state.store.getQuads(
        df.namedNode(appOntology + stepName),
        df.namedNode(rdf + "type"),
        df.namedNode(poc + "CreateStep")
      );

      //#endregion
      //#region Collect step type specific info 
      if (isGetStep.length > 0) {
        for (const quad of inputPortQuads) {
          //#region Get Index and Source Port URIs 
          const isSourcePort = state.store.getQuads(
            df.namedNode(quad.object.value),
            df.namedNode(rdfs + "label"),
            df.literal("source", df.namedNode(xsd + "string"))
          );
          const isIndexPort = state.store.getQuads(
            df.namedNode(quad.object.value),
            df.namedNode(rdfs + "label"),
            df.literal("index", df.namedNode(xsd + "string"))
          );

          if (isSourcePort.length > 0) {
            sourcePortURI = quad.object.value;

            //#region Get listUri

            const pipeGoesToSourcePort = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(sourcePortURI));
            const pipeURI = pipeGoesToSourcePort[0].subject.value;
            const isPortPipe = state.store.getQuads(df.namedNode(pipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));
            const isDirectPipe = state.store.getQuads(df.namedNode(pipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
            if (isPortPipe.length > 0) {
              const targetPort = state.store.getQuads(df.namedNode(pipeURI), df.namedNode(poc + "targetPort"), null);
              if (targetPort.length == 0) {
                vue.$bvToast.toast("Warning the pipe " + pipeURI + " is a port pipe but does not have targetPort");
                commit("stopExecution");
                return;
              }
              const targetPortName = targetPort[0].object.value.substring(targetPort[0].object.value.lastIndexOf("#") + 1);
              if (!(await (fc.itemExists(`${state.userRoot}/poc/workflow_instances/${randomString}_step_instances/${targetPortName}.ttl`)))) {
                vue.$bvToast.toast("Error get step's source port has a port pipe that is not ready yet");
                return;
              }
              const res = await fc.readFile(`${state.userRoot}/poc/workflow_instances/${randomString}_step_instances/${targetPortName}.ttl`);
              const miniStore = new N3.Store();
              const parser = new N3.Parser();
              const quads = parser.parse(res);
              miniStore.addQuads(quads);
              const uriValue = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
              if (uriValue.length == 0) {
                vue.$bvToast.toast("Error get step's source port has a port pipe that has literal value");
                return;
              }
              listUri = uriValue[0].object.value;
            } else if (isDirectPipe.length > 0) {
              const uriValue = state.store.getQuads(df.namedNode(pipeURI), df.namedNode(poc + "sourceUriValue"), null);
              if (uriValue.length == 0) {
                vue.$bvToast.toast("Error get step's source port has a direct pipe that has literal value");
                return;
              }
              listUri = uriValue[0].object.value;
            } else {
              vue.$bvToast.toast("Error get step's source port has a pipe that is not port or direct");
              return;
            }

            if (listUri.startsWith(appOntology)) {
              const isList = state.store.getQuads(df.namedNode(listUri), df.namedNode(rdf + "type"), df.namedNode(poc + "List"));

              if (isList.length == 0) {
                vue.$bvToast.toast("Error get step's source port has a uri value that is not a list");
                return;
              }
            }


            //#endregion
          } else if (isIndexPort.length > 0) {
            const pipeTargetsThisPort = state.store.getQuads(
              null,
              df.namedNode(poc + "targetPort"),
              df.namedNode(quad.object.value)
            );
            if (pipeTargetsThisPort.length == 0) {
              vue.$bvToast.toast(
                "Error a inputport does not have pipe going to it in" +
                stepName
              );
              return;
            }
            const isHumanPipe = state.store.getQuads(
              df.namedNode(pipeTargetsThisPort[0].subject.value),
              df.namedNode(rdf + "type"),
              df.namedNode(poc + "HumanPipe")
            );
            if (isHumanPipe.length > 0) {
              indexPortURI = quad.object.value;
            } else {
              vue.$bvToast.toast(
                "Input port of get step does not have a human pipe on index port"
              );
              return;
            }
          } else {
            vue.$bvToast.toast("In a get step there is a input port which is not index or source labeled");
            return;
          }
          //#endregion
        }
      } else if (isCreateStep.length > 0) {
        for (const quad of inputPortQuads) {
          //#region Get Datatype and Object port URIs
          const isObjectPort = state.store.getQuads(
            df.namedNode(quad.object.value),
            df.namedNode(rdfs + "label"),
            df.literal("object", df.namedNode(xsd + "string"))
          );
          const isDatatypePort = state.store.getQuads(
            df.namedNode(quad.object.value),
            df.namedNode(rdfs + "label"),
            df.literal("datatype", df.namedNode(xsd + "string"))
          );

          if (isDatatypePort.length > 0) {
            datatypePortURI = quad.object.value;
            datatypePortName = datatypePortURI.substring(datatypePortURI.lastIndexOf("#") + 1);
          } else if (isObjectPort.length > 0) {
            const pipeTargetsThisPort = state.store.getQuads(
              null,
              df.namedNode(poc + "targetPort"),
              df.namedNode(quad.object.value)
            );
            if (pipeTargetsThisPort.length == 0) {
              vue.$bvToast.toast(
                "Error a inputport does not have pipe going to it in" +
                stepName
              );
              return;
            }
            const isHumanPipe = state.store.getQuads(
              df.namedNode(pipeTargetsThisPort[0].subject.value),
              df.namedNode(rdf + "type"),
              df.namedNode(poc + "HumanPipe")
            );
            if (isHumanPipe.length > 0) {
              objectPortURI = quad.object.value;
            } else {
              vue.$bvToast.toast(
                "Input port of create step does not have a human pipe on object port"
              );
              return;
            }
          } else {
            vue.$bvToast.toast(
              "In a create step there is a input port which is not object or datatype labeled"
            );
            return;
          }
          //#endregion
        }

      } else {
        vue.$bvToast.toast(
          "In this application a human pipe is not supported in steps other than create step and get step(for index selection)"
        );
        return;
      }
      //#endregion      
      //#region Use step type, input ports informations and show input form to user

      const h = vue.$createElement;

      // Add comment element first
      const commentQuads = state.store.getQuads(df.namedNode(appOntology + stepName), df.namedNode(rdfs + "comment"), null);
      const vNodes = [h(
        "p",
        {
          domProps: {
            innerHTML: commentQuads.length > 0 ? commentQuads[0].object.value + (isCreateStep.length > 0 ? " (please use up down arrows on number inputs to see allowed range)" : "") : "No description given for this input"
          }
        },
        []
      )];

      if (isCreateStep.length > 0) {
        let inputsNeeded = [];
        let isComposite;
        const pipeTargetsDatatypeQuads = state.store.getQuads(
          null,
          df.namedNode(poc + "targetPort"),
          df.namedNode(datatypePortURI)
        );
        if (pipeTargetsDatatypeQuads.length != 1) {
          vue.$bvToast.toast(
            "Datatype port does not have exactly one pipe goes into it."
          );
          return;
        }
        const datatypePortPipeURI = pipeTargetsDatatypeQuads[0].subject.value;
        const isDirectPipe = state.store.getQuads(
          df.namedNode(datatypePortPipeURI),
          df.namedNode(rdf + "type"),
          df.namedNode(poc + "DirectPipe")
        );
        const isPortPipe = state.store.getQuads(
          df.namedNode(datatypePortPipeURI),
          df.namedNode(rdf + "type"),
          df.namedNode(poc + "PortPipe")
        );

        if (isDirectPipe.length > 0) {
          const hasUriValue = state.store.getQuads(
            df.namedNode(datatypePortPipeURI),
            df.namedNode(poc + "sourceUriValue"),
            null
          );

          if (hasUriValue.length > 0) {
            const uriValue = hasUriValue[0].object.value;
            datatype = uriValue;
          } else {
            vue.$bvToast.toast(
              "A direct pipe does not have sourceUriValue for datatype port"
            );
            return;
          }
        } else if (isPortPipe.length > 0) {
          if (await (fc.itemExists(`${state.userRoot}/poc/workflow_instances/${randomString}_step_instances/${datatypePortName}.ttl`))) {
            const res = await fc.readFile(`${state.userRoot}/poc/workflow_instances/${randomString}_step_instances/${datatypePortName}.ttl`);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
            if (uriValueQuad.length == 0) {
              vue.$bvToast.toast("The datatype comes from a port pipe in create step but there comes a literal value to datatype which is illegal");
              return;
            }
            datatype = uriValueQuad[0].object.value;
          } else {
            vue.$bvToast.toast("The datatype comes from a port pipe in create step but nothing produced from the port to supply");
            return;
          }
        } else {
          vue.$bvToast.toast(
            "The datatype port of create step does not have a pipe which is either a port pipe or a direct pipe."
          );
          return;
        }
        if (datatype.startsWith(xsd)) { // literal 
          isComposite = false;
        } else { // composite 
          isComposite = true;
          const fieldQuads = state.store.getQuads(
            df.namedNode(datatype),
            df.namedNode(poc + "dataField"),
            null
          );
          fieldQuads.forEach(fieldQuad => {
            const fieldURI = fieldQuad.object.value;
            const fieldTypeQuads = state.store.getQuads(df.namedNode(fieldURI), df.namedNode(poc + "fieldType"), null);
            const fieldTypeURI = fieldTypeQuads[0].object.value;
            const labelQuad = state.store.getQuads(df.namedNode(fieldURI), df.namedNode(rdfs + "label"), null);
            const isRequiredQuad = state.store.getQuads(df.namedNode(fieldURI), df.namedNode(poc + "isRequired"), null);
            const doesHaveContantIntegerValue = state.store.getQuads(df.namedNode(fieldURI), df.namedNode(poc + "hasInitialIntegerValue"), null);
            const description = state.store.getQuads(df.namedNode(fieldURI), df.namedNode(dcterms + "description"), null);
            inputsNeeded.push({
              field: fieldURI,
              type: fieldTypeURI,
              label: labelQuad[0].object.value,
              isRequired: isRequiredQuad[0].object.value,
              description: description[0].object.value,
              value: undefined,
              hasInitialIntegerValue: doesHaveContantIntegerValue.length > 0 ? parseInt(doesHaveContantIntegerValue[0].object.value) : undefined
            });
          });
        }

        if (isComposite) {
          /*
            {
              field: fieldURI,
              type: fieldTypeURI,
              label: labelQuad[0].object.value,
              isRequired: isRequiredQuad[0].object.value,
              value: undefined
            }
          */
          let show = true;
          const inputNodes = [];

          inputsNeeded = inputsNeeded.sort((b, a) => a.label.charCodeAt(0) - b.label.charCodeAt(0));
          if (inputsNeeded[1].label == "title") {
            let temp;
            temp = inputsNeeded[0];
            inputsNeeded[0] = inputsNeeded[1];
            inputsNeeded[1] = temp;
          }

          for (const inp of inputsNeeded) {
            if (inp.type.startsWith(xsd)) {
              if (inp.hasInitialIntegerValue != undefined) {
                inp.value = inp.hasInitialIntegerValue;
                return;
              }
              const xsdName = inp.type.substring(inp.type.lastIndexOf("#") + 1);
              inputNodes.push(h(
                "p",
                {
                  domProps: {
                    innerHTML: "<b>" + inp.label + "</b>" + (inp.isRequired == "true" ? " (required) " : "")
                  }
                },
                []
              ));

              inputNodes.push(h(
                "p",
                {
                  domProps: {
                    innerHTML: "<b>Description:</b>" + inp.description
                  }
                },
                []
              ));

              if (xsdName == "dateTime") {
                inputNodes.push(h(
                  "b-form-input",
                  {
                    props: {
                      type: "date",
                    },
                    on: {
                      update: function (value) {
                        inp.dateValue = value;
                      }
                    },
                  },
                  []
                ));
                inputNodes.push(h(
                  "b-form-input",
                  {
                    props: {
                      type: 'time',
                    },
                    on: {
                      update: function (value) {
                        inp.timeValue = value;
                      }
                    }
                  },
                  []
                ));
              } else {
                if (xsdName == "string" || xsdName == "anyURI") {
                  inputNodes.push(h(
                    "b-form-input",
                    {
                      props: {
                        type: 'text',
                      },
                      on: {
                        change: function (value) {
                          inp.value = value;
                        }
                      }
                    },
                    []
                  ));
                } else if (xsdName == "boolean") {
                  inputNodes.push(h(
                    "b-form-input",
                    {
                      props: {
                        type: 'range',
                        min: 0,
                        max: 1
                      },
                      on: {
                        change: function (value) {
                          inp.value = value;
                        }
                      }
                    },
                    []
                  ));
                } else if (xsdName == "integer") {
                  inputNodes.push(h(
                    "b-form-input",
                    {
                      props: {
                        type: 'number',
                        placeholder: "An integer"
                      },
                      on: {
                        change: function (value) {
                          inp.value = value;
                        }
                      }
                    },
                    []
                  ));
                } else if (xsdName == "decimal" || xsdName == "float" || xsdName == "double") {
                  inputNodes.push(h(
                    "b-form-input",
                    {
                      props: {
                        type: 'number',
                        placeholder: "A real number"
                      },
                      on: {
                        change: function (value) {
                          inp.value = value;
                        }
                      }
                    },
                    []
                  ));
                } else if (xsdName == "nonNegativeInteger") {
                  inputNodes.push(h(
                    "b-form-input",
                    {
                      props: {
                        type: 'number',
                        min: 0,
                        placeholder: "A nonnegative integer"
                      },
                      on: {
                        change: function (value) {
                          inp.value = value;
                        }
                      }
                    },
                    []
                  ));
                } else if (xsdName == "nonPositiveInteger") {
                  inputNodes.push(h(
                    "b-form-input",
                    {
                      props: {
                        type: 'number',
                        max: 0,
                        placeholder: "A nonpositive integer"
                      },
                      on: {
                        change: function (value) {
                          inp.value = value;
                        }
                      }
                    },
                    []
                  ));
                } else if (xsdName == "negativeInteger") {
                  inputNodes.push(h(
                    "b-form-input",
                    {
                      props: {
                        type: 'number',
                        max: -1,
                        placeholder: "A negative integer"
                      },
                      on: {
                        change: function (value) {
                          inp.value = value;
                        }
                      }
                    },
                    []
                  ));
                } else if (xsdName == "positiveInteger") {
                  inputNodes.push(h(
                    "b-form-input",
                    {
                      props: {
                        type: 'number',
                        min: 1,
                        placeholder: "A positive integer"
                      },
                      on: {
                        change: function (value) {
                          inp.value = value;
                        }
                      }
                    },
                    []
                  ));
                }
              }
            } else {

              const dataInstances = state.dataInstances.filter(x => {
                return x.datatype == inp.type;
              });
              if (dataInstances.length == 0) {
                vue.$bvToast.toast("Currently there is not any data instance of type " + inp.type + " to choose from");
                show = false;
              }
              inputNodes.push(h(
                "p",
                {
                  domProps: {
                    innerHTML: inp.label + (inp.isRequired == "true" ? " (required) " : "")
                  }
                },
                []
              ));
              inputNodes.push(h(
                "p",
                {
                  domProps: {
                    innerHTML: "description:" + inp.description
                  }
                },
                []
              ));

              const optionsList = [];
              for (const dataInstance of dataInstances) {
                const miniStore = new N3.Store();
                const res = await fc.readFile(dataInstance.uri);
                const parser = new N3.Parser();
                const quads = parser.parse(res);
                miniStore.addQuads(quads);
                const fieldValueQuads = miniStore.getQuads(null, df.namedNode(poc + "fieldValue"), null);
                let title;
                for (const fieldValue of fieldValueQuads) {
                  const isTitleQuad = miniStore.getQuads(df.blankNode(fieldValue.object.value), df.namedNode(rdfs + "label"), df.literal("title", df.namedNode(xsd + "string")));
                  if (isTitleQuad.length > 0) {
                    title = miniStore.getQuads(df.blankNode(fieldValue.object.value), df.namedNode(poc + "literalValue"), null)[0].object.value;
                  }
                }
                optionsList.push({
                  value: dataInstance.uri,
                  text: title,
                });
              }
              inputNodes.push(h(
                "b-form-select",
                {
                  props: {
                    options: optionsList
                  },
                  on: {
                    input: function (value) {
                      inp.value = value;
                    }
                  },
                },
                []
              ));
            }
          }

          if (show) {
            vNodes.push(
              h("b-form",
                {},
                inputNodes
              )
            );
            vue.$bvModal.msgBoxConfirm([vNodes], {
              title: 'Please enter input',
              size: 'xl',
              buttonSize: 'sm',
              okVariant: 'success',
              okTitle: 'Submit',
              cancelTitle: 'Cancel',
              footerClass: 'p-2',
              hideHeaderClose: false,
              centered: true
            }).then(async value => {
              if (value) {
                inputsNeeded = inputsNeeded.map(i => {
                  const ifLiteral = i.type.startsWith(xsd);
                  return {
                    label: i.label,
                    value: (i.dateValue != undefined && i.timeValue != undefined) ? new Date(i.dateValue + " " + i.timeValue).toISOString() : i.value,
                    type: ifLiteral ? "literal" : "uri",
                    typeName: ifLiteral ? i.type.substring(i.type.lastIndexOf("#") + 1) : "",
                    isRequired: i.isRequired
                  };
                });
                let exit = 0;
                inputsNeeded.forEach(i => {
                  if (i.isRequired == "true" && i.value == undefined) {
                    exit = 1;
                    vue.$bvToast.toast(`The input ${i.label} is required, human input cancelled.`);
                  }
                });
                if (exit) {
                  return;
                }
                const randomStringForDataInstance = generateRandomString();
                const dataInstanceTTL = constants.compositeDataInstance(inputsNeeded, datatype);
                const dataInstanceLocationURI = `${state.userRoot}/poc/data_instances/data_instance_${randomStringForDataInstance}.ttl`
                await fc.postFile(dataInstanceLocationURI, dataInstanceTTL, "text/turtle");
                const uriValueBinding = constants.URIValueBinding(dataInstanceLocationURI);

                await dispatch("handleOutputPort", { deleteTrue: true, vue: vue, workflowInstanceID: randomString, stepName: stepName, valueBindingContent: uriValueBinding });


                vue.$bvToast.toast("Input entered successfully");
                state.userWorkflowInstances.forEach(x => {
                  if (x.url.includes(randomString)) x.needInput = false;
                })
                //#region Mark the step as completed 
                const res2 = await fc.readFile(`${state.userRoot}/poc/workflow_instances/${randomString}_step_instances/${stepName}.ttl`);
                const parser = new N3.Parser();
                const writer = new N3.Writer({
                  prefixes: {
                    poc: poc,
                    dcterms: dcterms,
                    rdf: rdf,
                    xsd: xsd,
                    rdfs: rdfs,
                    owl: owl,
                    appOntology: appOntology
                  },
                });
                const quads2 = parser.parse(res2);
                let isCompleteAlready;
                quads2.forEach(q => {
                  if (q.predicate.value == poc + "status") {
                    isCompleteAlready = q.object.value == "completed";
                    writer.addQuad(q.subject, q.predicate, df.literal("completed", df.namedNode(xsd + "string")));
                  } else {
                    writer.addQuad(q);
                  }
                });
                writer.end(async (err, res) => {
                  await fc.createFile(`${state.userRoot}/poc/workflow_instances/${randomString}_step_instances/${stepName}.ttl`, res, "text/turtle");
                  await fc.deleteFile(humanInputFileURL);
                  if (!isCompleteAlready) vue.$bvToast.toast("The step " + stepName + " has been completed.");
                  dispatch("executeWorkflowInstance", { workflowURI: workflowURI, workflowInstanceID: randomString, vue: vue });
                });
                //#endregion
              }
              else vue.$bvToast.toast("Human input cancellation");
            }).catch(err => {
              vue.$bvToast.toast("An error occured " + JSON.stringify(err));
            });
          }
        } else {
          let dateValue = "";
          let timeValue = "";
          let dateTimeValue;
          let otherValue;
          const xsdName = datatype.substring(datatype.lastIndexOf("#") + 1);
          const inputNodes = [];
          if (xsdName == "dateTime") {
            inputNodes.push(h(
              "b-form-input",
              {
                props: {
                  type: "date",
                },
                on: {
                  update: function (value) {
                    dateValue = value;
                  }
                },
              },
              []
            ));
            inputNodes.push(h(
              "b-form-input",
              {
                props: {
                  type: 'time',
                },
                on: {
                  change: function (value) {
                    timeValue = value;
                  }
                }
              },
              []
            ));
          } else {
            if (xsdName == "string" || xsdName == "anyURI") {
              inputNodes.push(h(
                "b-form-input",
                {
                  props: {
                    type: 'text'
                  },
                  on: {
                    change: function (value) {
                      otherValue = value;
                    }
                  }
                },
                []
              ));
            } else if (xsdName == "boolean") {
              inputNodes.push(h(
                "b-form-input",
                {
                  props: {
                    type: 'range',
                    min: 0,
                    max: 1
                  },
                  on: {
                    change: function (value) {
                      otherValue = value;
                    }
                  }
                },
                []
              ));
            } else if (xsdName == "integer") {
              inputNodes.push(h(
                "b-form-input",
                {
                  props: {
                    type: 'number',
                    placeholder: "An integer"
                  },
                  on: {
                    change: function (value) {
                      otherValue = value;
                    }
                  }
                },
                []
              ));
            } else if (xsdName == "decimal" || xsdName == "float" || xsdName == "double") {
              inputNodes.push(h(
                "b-form-input",
                {
                  props: {
                    type: 'number',
                    placeholder: "A real number"
                  },
                  on: {
                    change: function (value) {
                      otherValue = value;
                    }
                  }
                },
                []
              ));
            } else if (xsdName == "nonNegativeInteger") {
              inputNodes.push(h(
                "b-form-input",
                {
                  props: {
                    type: 'number',
                    min: 0,
                    placeholder: "A nonnegative integer"
                  },
                  on: {
                    change: function (value) {
                      otherValue = value;
                    }
                  }
                },
                []
              ));
            } else if (xsdName == "nonPositiveInteger") {
              inputNodes.push(h(
                "b-form-input",
                {
                  props: {
                    type: 'number',
                    max: 0,
                    placeholder: "A nonpositive integer"
                  },
                  on: {
                    change: function (value) {
                      otherValue = value;
                    }
                  }
                },
                []
              ));
            } else if (xsdName == "negativeInteger") {
              inputNodes.push(h(
                "b-form-input",
                {
                  props: {
                    type: 'number',
                    max: -1,
                    placeholder: "A negative integer"
                  },
                  on: {
                    change: function (value) {
                      otherValue = value;
                    }
                  }
                },
                []
              ));
            } else if (xsdName == "positiveInteger") {
              inputNodes.push(h(
                "b-form-input",
                {
                  props: {
                    type: 'number',
                    min: 1,
                    placeholder: "A positive integer"
                  },
                  on: {
                    change: function (value) {
                      otherValue = value;
                    }
                  }
                },
                []
              ));
            }
          }
          vNodes.push(
            h("b-form",
              {},
              inputNodes
            )
          );
          vue.$bvModal.msgBoxConfirm([vNodes], {
            title: 'Please enter input',
            size: 'xl',
            buttonSize: 'sm',
            okVariant: 'success',
            okTitle: 'Submit',
            cancelTitle: 'Cancel',
            footerClass: 'p-2',
            hideHeaderClose: false,
            centered: true
          }).then(async value => {
            if (value) {
              dateTimeValue = new Date(dateValue + " " + timeValue);
              let valueBindingContent;

              if (xsdName == "dateTime") {
                valueBindingContent = constants.literalValueBinding(dateTimeValue, xsdName);
              } else {
                valueBindingContent = constants.literalValueBinding(otherValue, xsdName);
              }

              let deleteTrue;

              if (xsdName == "dateTime") {
                deleteTrue = dateTimeValue;
              } else {
                deleteTrue = otherValue;
              }

              await dispatch("handleOutputPort", { deleteTrue: deleteTrue, vue: vue, workflowInstanceID: randomString, stepName: stepName, valueBindingContent: valueBindingContent });

              vue.$bvToast.toast("Input entered successfully");
              state.userWorkflowInstances.forEach(x => {
                if (x.url.includes(randomString)) x.needInput = false;
              })
              //#region Mark the step as completed 
              const res2 = await fc.readFile(`${state.userRoot}/poc/workflow_instances/${randomString}_step_instances/${stepName}.ttl`);
              const parser = new N3.Parser();
              const writer = new N3.Writer({
                prefixes: {
                  poc: poc,
                  dcterms: dcterms,
                  rdf: rdf,
                  xsd: xsd,
                  rdfs: rdfs,
                  owl: owl,
                  appOntology: appOntology
                },
              });
              const quads2 = parser.parse(res2);
              let isCompleteAlready;
              quads2.forEach(q => {
                if (q.predicate.value == poc + "status") {
                  isCompleteAlready = q.object.value == "completed";
                  writer.addQuad(q.subject, q.predicate, df.literal("completed", df.namedNode(xsd + "string")));
                } else {
                  writer.addQuad(q);
                }
              });
              writer.end(async (err, res) => {
                await fc.createFile(`${state.userRoot}/poc/workflow_instances/${randomString}_step_instances/${stepName}.ttl`, res, "text/turtle");
                await fc.deleteFile(humanInputFileURL);
                if (!isCompleteAlready) vue.$bvToast.toast("The step " + stepName + " has been completed.");
                dispatch("executeWorkflowInstance", { workflowURI: workflowURI, workflowInstanceID: randomString, vue: vue });
              });
              //#endregion


            } else vue.$bvToast.toast("Human input cancellation");
          }).catch(err => {
            vue.$bvToast.toast("An error occured " + JSON.stringify(err));
          });
        }
      } else {
        let show = true;
        const inputNodes = [];
        let indexValue;
        let dataInstanceList = [];

        if (listUri.startsWith(appOntology)) {
          await dispatch("fetchAllLists");
          for (const list of state.lists) {
            if (list.listName == listUri) dataInstanceList = list.list;
          }
        } else {
          const miniStore = new N3.Store();
          try {
            const res = await fc.readFile(listUri);
            const parser = new N3.Parser();
            let headOfList;
            const quadsParsed = parser.parse(res);
            miniStore.addQuads(quadsParsed);

            const isList = miniStore.getQuads(null, df.namedNode(rdf + "type"), df.namedNode(poc + "List"));

            if (isList.length == 0) {
              vue.$bvToast.toast("Error getstep's source port has a uri value that is not a list");
              commit("stopExecution");
              return;
            }
            const isListEmpty = miniStore.getQuads(null, df.namedNode(poc + "items"), rdf + "nil");

            if (isListEmpty.length == 0) { // If not empty 
              let listHeadQuads = miniStore.getQuads(null, df.namedNode(rdf + "first"), null);

              // Filter out the ones that are rest of some node to find real head of lists
              listHeadQuads = listHeadQuads.filter(item => {
                return miniStore.getQuads(null, df.namedNode(rdf + "rest"), df.blankNode(item.subject.value)).length == 0;
              });
              if (listHeadQuads.length != 1) {
                vue.$bvToast.toast(`The list ${listUri} does not have a poc:items in it properly`);
                commit("stopExecution");
                return;
              }
              headOfList = listHeadQuads[0];
              let current = headOfList.subject.value;
              let quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
              while (quads.length > 0 && quads[0].object.value != rdf + "nil") {
                const obj = quads[0].object;
                dataInstanceList.push(obj);
                let rest = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "rest"), null);
                current = rest[0].object.value;
                if (current == rdf + "nil") break;
                quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
              }
            }
          } catch (error) {
            vue.$bvToast.toast(`Can't read ${listUri}`);
            commit("stopExecution");
            return;
          }
        }


        if (dataInstanceList.length == 0) {
          vue.$bvToast.toast("Currently there is not any data instance of list " + listUri + " to choose from");
          show = false;
        }
        let counter = 0;
        const optionsList = [];
        for (const dataInstance of dataInstanceList) {
          const miniStore = new N3.Store();
          const res = await fc.readFile(dataInstance.value);
          const parser = new N3.Parser();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const fieldValueQuads = miniStore.getQuads(null, df.namedNode(poc + "fieldValue"), null);
          let title;
          for (const fieldValue of fieldValueQuads) {
            const isTitleQuad = miniStore.getQuads(df.blankNode(fieldValue.object.value), df.namedNode(rdfs + "label"), df.literal("title", df.namedNode(xsd + "string")));
            if (isTitleQuad.length > 0) {
              title = miniStore.getQuads(df.blankNode(fieldValue.object.value), df.namedNode(poc + "literalValue"), null)[0].object.value;
            }
          }
          optionsList.push({
            value: counter,
            text: title,
          });
          counter++;
        }

        inputNodes.push(h(
          "b-form-select",
          {
            props: {
              options: optionsList
            },
            on: {
              input: function (value) {
                indexValue = value;
              }
            },
          },
          []
        ));
        if (show) {
          vNodes.push(
            h("b-form",
              {},
              inputNodes
            )
          );
          vue.$bvModal.msgBoxConfirm([vNodes], {
            title: 'Please enter input',
            size: 'xl',
            buttonSize: 'sm',
            okVariant: 'success',
            okTitle: 'Submit',
            cancelTitle: 'Cancel',
            footerClass: 'p-2',
            hideHeaderClose: false,
            centered: true
          }).then(async value => {
            if (value) {

              let list = [];
              const listName = listUri.substring(
                listUri.lastIndexOf("#") + 1
              );

              state.lists.forEach(l => {
                if (l.listName == appOntology + listName) {
                  list = l.list;
                }
              });

              if (list.length == 0) {
                const miniStore = new N3.Store();
                try {
                  const res = await fc.readFile(listUri);
                  const parser = new N3.Parser();
                  let headOfList;
                  const quadsParsed = parser.parse(res);
                  miniStore.addQuads(quadsParsed);

                  const isList = miniStore.getQuads(null, df.namedNode(rdf + "type"), df.namedNode(poc + "List"));

                  if (isList.length == 0) {
                    vue.$bvToast.toast("Error getstep's source port has a uri value that is not a list");
                    commit("stopExecution");
                    return;
                  }
                  const isListEmpty = miniStore.getQuads(null, df.namedNode(poc + "items"), rdf + "nil");

                  if (isListEmpty.length == 0) { // If not empty 
                    let listHeadQuads = miniStore.getQuads(null, df.namedNode(rdf + "first"), null);

                    // Filter out the ones that are rest of some node to find real head of lists
                    listHeadQuads = listHeadQuads.filter(item => {
                      return miniStore.getQuads(null, df.namedNode(rdf + "rest"), df.blankNode(item.subject.value)).length == 0;
                    });
                    if (listHeadQuads.length != 1) {
                      vue.$bvToast.toast(`The list ${listUri} does not have a poc:items in it properly`);
                      commit("stopExecution");
                      return;
                    }
                    headOfList = listHeadQuads[0];
                    let current = headOfList.subject.value;
                    let quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
                    while (quads.length > 0 && quads[0].object.value != rdf + "nil") {
                      const obj = quads[0].object;
                      list.push(obj);
                      let rest = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "rest"), null);
                      current = rest[0].object.value;
                      if (current == rdf + "nil") break;
                      quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
                    }
                  } else {
                    vue.$bvToast.toast(`List empty in get step`);
                    commit("stopExecution");
                    return;
                  }
                } catch (error) {
                  vue.$bvToast.toast(`Can't read ${listUri}`);
                  commit("stopExecution");
                  return;
                }
              }


              const obj = list[indexValue];
              let valueBinding;
              if (obj.datatype) { // literal
                valueBinding = constants.literalValueBinding(obj.value, obj.datatype.value.substring(obj.datatype.value.lastIndexOf("#") + 1));
              } else {
                valueBinding = constants.URIValueBinding(obj.value);
              }

              await dispatch("handleOutputPort", { deleteTrue: true, vue: vue, workflowInstanceID: randomString, stepName: stepName, valueBindingContent: valueBinding });

              vue.$bvToast.toast("Input entered successfully");
              state.userWorkflowInstances.forEach(x => {
                if (x.url.includes(randomString)) x.needInput = false;
              })
              //#region Mark the step as completed 
              const res2 = await fc.readFile(`${state.userRoot}/poc/workflow_instances/${randomString}_step_instances/${stepName}.ttl`);
              const parser = new N3.Parser();
              const writer = new N3.Writer({
                prefixes: {
                  poc: poc,
                  dcterms: dcterms,
                  rdf: rdf,
                  xsd: xsd,
                  rdfs: rdfs,
                  owl: owl,
                  appOntology: appOntology
                },
              });
              const quads2 = parser.parse(res2);
              let isCompleteAlready;
              quads2.forEach(q => {
                if (q.predicate.value == poc + "status") {
                  isCompleteAlready = q.object.value == "completed";
                  writer.addQuad(q.subject, q.predicate, df.literal("completed", df.namedNode(xsd + "string")));
                } else {
                  writer.addQuad(q);
                }
              });
              writer.end(async (err, res) => {
                await fc.createFile(`${state.userRoot}/poc/workflow_instances/${randomString}_step_instances/${stepName}.ttl`, res, "text/turtle");
                await fc.deleteFile(humanInputFileURL);
                if (!isCompleteAlready) vue.$bvToast.toast("The step " + stepName + " has been completed.");
                dispatch("executeWorkflowInstance", { workflowURI: workflowURI, workflowInstanceID: randomString, vue: vue });
              });
              //#endregion

            }
            else vue.$bvToast.toast("Human input cancellation");
          });
        }
      }
      //#endregion
    },
    async fetchAllLists({ state, commit }) {
      let listQuads = state.store.getQuads(
        null,
        null,
        df.namedNode(poc + "List")
      );



      const listUris = listQuads.map(x => x.subject.value);
      state.lists = [];

      const listPromises = [];

      for (const x of listUris) {

        const getListOfAll = async (resolve, reject) => {

          const promises = [];
          const list = [];
          const listName = x.substring(
            x.lastIndexOf("#") + 1
          );
          for (const u of state.users) {

            const fetchList = async (resolve, reject) => {
              const url = new URL(u.object.value);
              const userRoot = `${url.protocol}//${url.hostname}`;
              try {
                const res = await fc.readFile(userRoot + "/poc/data_instances/" + listName + ".ttl");
                const parser = new N3.Parser();
                let headsOfLists = [];
                const miniStore = new N3.Store();
                parser.parse(res, (error, quad, prefixes) => {
                  if (quad) {
                    miniStore.addQuad(quad);
                    /* if (quad.predicate.value == rdf+"first" || quad.predicate.value == rdf+"rest") {
                      console.log(JSON.stringify(quad));
                    } */
                    if (quad.predicate.value == rdf + "first") {
                      headsOfLists.push(quad.subject.value);
                    }
                  } else {
                    // Filter out the ones that are rest of some node to find real head of lists
                    headsOfLists = headsOfLists.filter(item => {
                      return miniStore.getQuads(null, df.namedNode(rdf + "rest"), df.blankNode(item)).length == 0;
                    });
                    headsOfLists.forEach(x => {
                      let current = x;
                      let quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
                      while (quads.length > 0 && quads[0].object.value != rdf + "nil") {
                        const obj = quads[0].object;
                        obj["from"] = u.object.value;
                        list.push(obj);
                        let rest = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "rest"), null);
                        current = rest[0].object.value;
                        if (current == rdf + "nil") break;
                        quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
                      }
                    });
                  }
                });

              } catch (error) {
                //vue.$bvToast.toast(`Can't read ${userRoot + "/poc/data_instances/" + listName + ".ttl"}`);
                console.log(error);
              }
              resolve();
            }

            promises.push(new Promise(fetchList).catch(err => console.log(err)));
          }
          await Promise.all(promises);
          commit("addList", {
            listName: appOntology + listName,
            list: list
          });
          resolve();
        };
        listPromises.push(new Promise(getListOfAll).catch(err => console.log(err)));
      }
      await Promise.all(listPromises);
    },
    async fetchAllDataInstances({ state, commit }) {


      //#region Fetch mine
      try {
        const res = await fc.readFolder(state.userRoot + "/poc/data_instances");

        for (const f of res.files) {

          if (f.url.substring(f.url.lastIndexOf("/") + 1).startsWith("data_instance")) {
            const miniStore = new N3.Store();
            const parser = new N3.Parser();
            const res = await fc.readFile(f.url);
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const creator = miniStore.getQuads(null, df.namedNode(dcterms + "creator"), null);
            const created = miniStore.getQuads(null, df.namedNode(dcterms + "created"), null);
            const datatype = miniStore.getQuads(null, df.namedNode(poc + "datatype"), null);
            const fieldValueQuads = miniStore.getQuads(null, df.namedNode(poc + "fieldValue"), null);

            let fieldValues = [];
            for (const fieldValueQuad of fieldValueQuads) {
              const label = miniStore.getQuads(df.blankNode(fieldValueQuad.object.value), df.namedNode(rdfs + "label"), null);
              const literalValue = miniStore.getQuads(df.blankNode(fieldValueQuad.object.value), df.namedNode(poc + "literalValue"), null);
              const uriValue = miniStore.getQuads(df.blankNode(fieldValueQuad.object.value), df.namedNode(poc + "uriValue"), null);
              fieldValues.push({
                label: label[0].object.value,
                value: literalValue.length > 0 ? literalValue[0].object.value : uriValue[0].object.value 
              });
            }

            // Only have this if this is a composite datatype
            commit("addUserDataInstance", {
              userDataInstance: {
                uri: f.url,
                creator: creator.length > 0 ? creator[0].object.value : "",
                created: created.length > 0 ? created[0].object.value : "",
                datatype: datatype.length > 0 ? datatype[0].object.value : "",
                fieldValues: fieldValues
              },
            });
          }
        }
      } catch (error) {
        // vue.$bvToast.toast(`Can't read ${userRoot + "/poc/data_instances/"}`);
        console.log(`Can't read ${state.userRoot}/poc/data_instances/`);
      }

      //#endregion

      const promises = [];
      for (const u of state.users) {
        const fetchAllDataInstances = async (resolve, reject) => {
          if (u != state.user) {
            const url = new URL(u.object.value);
            const userRoot = `${url.protocol}//${url.hostname}`;
            try {
              const res = await fc.readFolder(userRoot + "/poc/data_instances");

              for (const f of res.files) {

                if (f.url.substring(f.url.lastIndexOf("/") + 1).startsWith("data_instance")) {
                  const miniStore = new N3.Store();
                  const parser = new N3.Parser();
                  const res = await fc.readFile(f.url);
                  const quads = parser.parse(res);
                  miniStore.addQuads(quads);
                  const creator = miniStore.getQuads(null, df.namedNode(dcterms + "creator"), null);
                  const created = miniStore.getQuads(null, df.namedNode(dcterms + "created"), null);
                  const datatype = miniStore.getQuads(null, df.namedNode(poc + "datatype"), null); // Only have this if this is a composite datatype
                  commit("addDataInstance", {
                    dataInstance: {
                      uri: f.url,
                      creator: creator.length > 0 ? creator[0].object.value : "",
                      created: created.length > 0 ? created[0].object.value : "",
                      datatype: datatype.length > 0 ? datatype[0].object.value : ""
                    },
                  });
                }
              }

            } catch (error) {
              // vue.$bvToast.toast(`Can't read ${userRoot + "/poc/data_instances/"}`);
              console.log(`Can't read ${userRoot}/poc/data_instances/`);
              reject(error);
            }
          }

          resolve();
        };
        promises.push(new Promise(fetchAllDataInstances).catch(err => console.log(err)));
      }
      await Promise.all(promises);
    },
    async fetchAllWorkflowInstances({ state, commit }, { vue }) {

      state.workflowInstances = [];
      const workflowInstancesPool = [];
      const userWorkflowInstancesPool = [];

      //#region fetch mine
      let res;
      try {
        res = await fc.readFolder(state.userRoot + "/poc/workflow_instances/");
        const promises = [];
        for (const file of res.files) {
          const fetchMinePromise = async (resolve, reject) => {

            const res = await fc.readFile(file.url);
            const parser = new N3.Parser({
              baseIRI: file.url,
            });
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const datatypeQuads = miniStore.getQuads(
              df.namedNode(file.url),
              df.namedNode(poc + "datatype"),
              null
            );
            workflowInstancesPool.push({ ...file, datatype: datatypeQuads[0].object.value });
            userWorkflowInstancesPool.push({ ...file, datatype: datatypeQuads[0].object.value, needInput: false });
            resolve();
          };
          promises.push(new Promise(fetchMinePromise).catch(err => console.log(err)));
        }
        await Promise.all(promises);
        commit("setUserWorkflowInstances", { userWorkflowInstances: userWorkflowInstancesPool });
      } catch (error) {
        //vue.$bvToast.toast(userRoot + " does not have any workflow yet");
        console.log("Cannot read " + state.userRoot + "/poc/workflow_instances/");
      }
      //#endregion

      const promises = [];
      // fetch others
      for (const u of state.users) {
        const fetchAllOfUser = async (reject, resolve) => {
          if (u != state.user) {
            const url = new URL(u.object.value);
            const userRoot = `${url.protocol}//${url.hostname}`;
            let res;
            try {
              res = await fc.readFolder(userRoot + "/poc/workflow_instances/");
              const userPromises = [];

              for (const file of res.files) {

                const fetchWorkflowInstances = async (resolve, reject) => {

                  const res = await fc.readFile(file.url);
                  const parser = new N3.Parser({
                    baseIRI: file.url,
                  });
                  const miniStore = new N3.Store();
                  const quads = parser.parse(res);
                  miniStore.addQuads(quads);
                  const datatypeQuads = miniStore.getQuads(
                    df.namedNode(file.url),
                    df.namedNode(poc + "datatype"),
                    null
                  );
                  workflowInstancesPool.push({ ...file, datatype: datatypeQuads[0].object.value });
                  resolve();
                };
                userPromises.push(new Promise(fetchWorkflowInstances).catch(err => console.log(err)));

              }
              await Promise.all(userPromises);
            } catch (error) {
              //vue.$bvToast.toast(userRoot + " does not have any workflow yet");
              console.log("Cannot read " + userRoot + "/poc/workflow_instances/");
            }


          }
          resolve();
        };
        promises.push(new Promise(fetchAllOfUser).catch(err => console.log(err)));
      }
      await Promise.all(promises);
      commit("setWorkflowInstances", { workflowInstances: workflowInstancesPool });
    },
    async discardExecutionPath({ state, commit, dispatch }, { pipeQuad, workflowInstanceID, vue }) {
      commit("halt");
      const targetStep = state.store.getQuads(df.namedNode(pipeQuad.subject.value), df.namedNode(poc + "targetStep"), null);

      if (targetStep.length == 0) {
        vue.$bvToast.toast("The conditional pipe " + pipeQuad.subject.value + " does not have a target step");
        commit("stopExecution");
        return;
      }
      const targetStepName = targetStep[0].object.value.substring(targetStep[0].object.value.lastIndexOf("#") + 1);
      let exists;
      if (await fc.itemExists(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetStepName}.ttl`)) {
        exists = true;
      }
      if (!exists) {
        vue.$bvToast.toast("This conditional pipe's target step does not exist " + pipeQuad.subject.value);
        commit("stopExecution");
        return;
      }
      const res = await fc.readFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetStepName}.ttl`);
      const parser = new N3.Parser();
      const writer = new N3.Writer({
        prefixes: {
          poc: poc,
          dcterms: dcterms,
          rdf: rdf,
          xsd: xsd,
          rdfs: rdfs,
          owl: owl,
          appOntology: appOntology
        },
      });
      const quads = parser.parse(res);
      let isCompleteAlready;
      quads.forEach(q => {
        if (q.predicate.value == poc + "status") {
          isCompleteAlready = q.object.value == "completed";
          writer.addQuad(q.subject, q.predicate, df.literal("completed", df.namedNode(xsd + "string")));
        } else {
          writer.addQuad(q);
        }
      });
      writer.end(async (err, res) => {
        await fc.createFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetStepName}.ttl`, res, "text/turtle");
      });
      if (!isCompleteAlready) vue.$bvToast.toast("The step " + targetStepName + " has been completed.");

      let stop = false;
      let currentStep = targetStepName;
      // if a control pipe or a port pipe comes to the step from a uncompleted step stop
      // till then, mark every step on the way as completed   
      while (!stop) {
        await new Promise(r => setTimeout(r, 1000));
        const pipesOriginateFromStep = state.store.getQuads(null, df.namedNode(poc + "sourceStep"), df.namedNode(appOntology + currentStep));
        stop = pipesOriginateFromStep.length == 0;
        let specialContructs = [];
        for (const pipe of pipesOriginateFromStep) {
          const specialContruct = {};
          const targetStep = state.store.getQuads(df.namedNode(pipe.subject.value), df.namedNode(poc + "targetStep"), null);
          const targetStepName = targetStep[0].object.value.substring(targetStep[0].object.value.lastIndexOf("#") + 1);
          const pipesGoesToTheStep = state.store.getQuads(null, df.namedNode(poc + "targetStep"), df.namedNode(appOntology + targetStepName))
          const specialPipes = [];
          for (const pipe2 of pipesGoesToTheStep) {
            const isPortPipe = state.store.getQuads(df.namedNode(pipe2.subject.value), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));
            const isControlPipe = state.store.getQuads(df.namedNode(pipe2.subject.value), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));

            if (isPortPipe.length > 0 || isControlPipe.length > 0) {
              specialPipes.push(pipe2);
            }
          }
          specialContruct.specialPipes = specialPipes;
          specialContruct.pipe = pipe;
          specialContructs.push(specialContruct);
        }
        specialContructs = specialContructs.sort((a, b) => a.specialPipes.length - b.specialPipes.length);
        for (const specialContruct of specialContructs) {

          const targetStep = state.store.getQuads(df.namedNode(specialContruct.pipe.subject.value), df.namedNode(poc + "targetStep"), null);
          const targetStepName = targetStep[0].object.value.substring(targetStep[0].object.value.lastIndexOf("#") + 1);
          for (const pipe2 of specialContruct.specialPipes) {
            const sourceStep = state.store.getQuads(df.namedNode(pipe2.subject.value), df.namedNode(poc + "sourceStep"), null);
            const sourceStepName = sourceStep[0].object.value.substring(sourceStep[0].object.value.lastIndexOf("#") + 1);
            let isComplete;

            const res = await fc.readFile(state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + sourceStepName + ".ttl");
            const miniStore = new N3.Store();
            const parser = new N3.Parser();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const status = miniStore.getQuads(null, df.namedNode(poc + "status"), null);
            if (status.length > 0) {
              const statusText = status[0].object.value;
              isComplete = (statusText == "completed");
            } else {
              vue.$bvToast.toast(`Warning a step named ${sourceStepName} in workflow instance ${workflowInstanceID} does not have status`);
              commit("stopExecution");
              return;
            }

            if (!isComplete) {
              stop = true;
            }

          }
          if (stop) break;

          let exists;
          if (await fc.itemExists(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetStepName}.ttl`)) {
            exists = true;
          }
          if (!exists) {
            vue.$bvToast.toast("This conditional pipe's target step does not exist " + pipeQuad.subject.value);
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetStepName}.ttl`);
          const parser = new N3.Parser();
          const writer = new N3.Writer({
            prefixes: {
              poc: poc,
              dcterms: dcterms,
              rdf: rdf,
              xsd: xsd,
              rdfs: rdfs,
              owl: owl,
              appOntology: appOntology
            },
          });
          const quads = parser.parse(res);
          let isCompleteAlready;
          for (const q of quads) {
            if (q.predicate.value == poc + "status") {
              isCompleteAlready = q.object.value == "completed";
              writer.addQuad(q.subject, q.predicate, df.literal("completed", df.namedNode(xsd + "string")));
            } else {
              writer.addQuad(q);
            }
          }
          writer.end(async (err, res) => {
            await fc.createFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetStepName}.ttl`, res, "text/turtle");
          });

          currentStep = targetStepName;
          if (specialContructs.length > 1 && specialContructs[0] == specialContruct) {
            dispatch("completeAllAfter", { stepName: currentStep, workflowInstanceID: workflowInstanceID, vue: vue });
          }
          if (!isCompleteAlready) vue.$bvToast.toast("The step " + targetStepName + " has been completed.");
        }
      }
      await new Promise(r => setTimeout(r, 2000));
      commit("continue");
    },
    async handleOutputPort({ state, commit, dispatch }, { deleteTrue, vue, workflowInstanceID, stepName, valueBindingContent }) {
      commit("halt");
      const pipesOriginateFromStep = state.store.getQuads(null, df.namedNode(poc + "sourceStep"), df.namedNode(appOntology + stepName));

      pipesOriginateFromStep.forEach(async p => {
        const isPortPipe = state.store.getQuads(df.namedNode(p.subject.value), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));
        const isUnconditionalPipe = state.store.getQuads(df.namedNode(p.subject.value), df.namedNode(rdf + "type"), df.namedNode(poc + "UnconditionalControlPipe"));
        const isTruePipe = state.store.getQuads(df.namedNode(p.subject.value), df.namedNode(rdf + "type"), df.namedNode(poc + "TruePipe"));
        const isFalsePipe = state.store.getQuads(df.namedNode(p.subject.value), df.namedNode(rdf + "type"), df.namedNode(poc + "FalsePipe"));
        if (isPortPipe.length > 0) {
          const targetPort = state.store.getQuads(df.namedNode(p.subject.value), df.namedNode(poc + "targetPort"), null);
          if (targetPort.length == 0) {
            vue.$bvToast.toast("Warning the pipe " + p.subject.value + " is a port pipe but does not have targetPort");
            commit("stopExecution");
            return;
          }
          const targetPortName = targetPort[0].object.value.substring(targetPort[0].object.value.lastIndexOf("#") + 1);
          await fc.postFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetPortName}.ttl`, valueBindingContent, "text/turtle");
        } else if (isUnconditionalPipe.length > 0) {
          const pipeName = p.subject.value.substring(p.subject.value.lastIndexOf("#") + 1);
          await fc.deleteFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${pipeName}.ttl`);
        } else if (isTruePipe.length > 0) {
          const pipeName = p.subject.value.substring(p.subject.value.lastIndexOf("#") + 1);
          if (deleteTrue) {
            await fc.deleteFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${pipeName}.ttl`);
          } else {
            await dispatch("discardExecutionPath", { pipeQuad: p, workflowInstanceID: workflowInstanceID, vue: vue });
          }
        } else if (isFalsePipe.length > 0) {
          const pipeName = p.subject.value.substring(p.subject.value.lastIndexOf("#") + 1);
          if (!deleteTrue) await fc.deleteFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${pipeName}.ttl`);
          else {
            await dispatch("discardExecutionPath", { pipeQuad: p, workflowInstanceID: workflowInstanceID, vue: vue });
          }
        } else {
          vue.$bvToast.toast("Warning! The pipe " + p.subject.value + " has an invalid type!");
          commit("stopExecution");
          return;
        }
      });
      commit("continue");
    },
    async handleOutputPortSimple({ state, commit }, { stepName, vue, workflowInstanceID }) {
      const pipesOriginateFromStep = state.store.getQuads(null, df.namedNode(poc + "sourceStep"), df.namedNode(appOntology + stepName));
      pipesOriginateFromStep.forEach(async p => {

        const isUnconditionalPipe = state.store.getQuads(df.namedNode(p.subject.value), df.namedNode(rdf + "type"), df.namedNode(poc + "UnconditionalControlPipe"));

        if (isUnconditionalPipe.length > 0) {
          const pipeName = p.subject.value.substring(p.subject.value.lastIndexOf("#") + 1);
          await fc.deleteFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${pipeName}.ttl`);
        } else {
          vue.$bvToast.toast("Warning! The pipe " + p.subject.value + " has an invalid type in save step!");
          commit("stopExecution");
          return;
        }
      });
    },
    async executeCreateStep({ state, commit, dispatch }, { vue, stepName, workflowInstanceID, inputPorts, outputPorts, stepToRun }) {
      //#region Validation
      const checklist = [0, 0, 0];
      if (inputPorts.length != 2) {
        vue.$bvToast.toast("The CreateStep " + stepToRun + " does not have exactly 2 input ports");
        commit("stopExecution");
        return;
      }
      inputPorts.forEach(i => {
        if (i.label == "datatype") {
          checklist[0] = 1;
        } else if (i.label == "object") {
          checklist[1] = 1;
        }
      });
      if (outputPorts.length != 1) {
        vue.$bvToast.toast("The CreateStep " + stepToRun + " does not have exactly 1 output port");
        commit("stopExecution");
        return;
      }
      outputPorts.forEach(i => {
        if (i.label == "result") {
          checklist[2] = 1;
        }
      });
      if (!checklist[0] || !checklist[1] || !checklist[2]) {
        vue.$bvToast.toast("The CreateStep " + stepToRun + " does not have ports labeled correctly");
        commit("stopExecution");
        return;
      }
      else {
        //#endregion
        //#region Get ports and pipes of them 
        const datatypePort = inputPorts[0].label == "datatype" ? inputPorts[0] : inputPorts[1];
        const objectPort = inputPorts[0].label == "object" ? inputPorts[0] : inputPorts[1];
        const datatypePipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(datatypePort.uri));
        const objectPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(objectPort.uri));


        if (datatypePipe.length == 0 || objectPipe.length == 0) { // Check if there are pipes that come in to the ports 
          vue.$bvToast.toast("The CreateStep " + stepToRun + " does not have pipes that targets both datatype and object ports");
          commit("stopExecution");
          return;
        }
        const datatypePipeURI = datatypePipe[0].subject.value;
        const objectPipeURI = objectPipe[0].subject.value;
        const datatypePortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + datatypePort.name + ".ttl";
        const objectPortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + objectPort.name + ".ttl";
        //#endregion
        //#region Datatype Port
        const isDatatypePipeHumanPipe = state.store.getQuads(df.namedNode(datatypePipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isDatatypePipeDirectPipe = state.store.getQuads(df.namedNode(datatypePipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isDatatypePipeControlPipe = state.store.getQuads(df.namedNode(datatypePipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isDatatypePipePortPipe = state.store.getQuads(df.namedNode(datatypePipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));



        let datatype;
        let object;
        // If datatype is entered by human it is stored directly in the step_instances folder 
        // If object is entered bu human, if it is a complex data there is a reference value binding in the step_instances folder to a data_instance in data_instances folder
        // If the object is a xsd datatype it is stored in step instances folder

        if (isDatatypePipeHumanPipe.length > 0) { // if it is human pipe the data should be in the pod of the user
          if (!(await fc.itemExists(datatypePortDataLocation))) {
            commit("stopExecution");
            vue.$bvToast.toast("The inputport " + datatypePort.name + " that should be entered by the human does not exists.");
            return;
          }
          const res = await fc.readFile(datatypePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            datatype = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + datatypePort.name + ", the datatype entered by human cannot be literal")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + datatypePort.name + ", the datatype entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }

        } else if (isDatatypePipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + datatypePort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isDatatypePipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(datatypePipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(datatypePipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            datatype = hasSourceURIValue[0].object.value;
          } else if (hasSourceLiteralValue.length > 0) {
            vue.$bvToast.toast("The datatype port " + datatypePort.name + " has a direct pipe with a literal value which is wrong");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("The datatype port " + datatypePort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isDatatypePipePortPipe.length > 0) {
          // There should be a inputPort entry in the step instances folder. 
          if (!(await fc.itemExists(datatypePortDataLocation))) {
            vue.$bvToast.toast("The inputport " + datatypePort.name + " that should be created by automation does not exists");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(datatypePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            datatype = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + datatypePort.name + ", the datatype entered by automation cannot be literal")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + datatypePort.name + ", the datatype entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + datatypePipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        //#endregion
        //#region Object Port
        const isObjectPipeHumanPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isObjectPipeDirectPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isObjectPipeControlPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isObjectPipePortPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));


        if (isObjectPipeHumanPipe.length > 0) {
          if (!(await fc.itemExists(objectPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the human does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(objectPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
            const datatypeCheck = state.store.getQuads(df.namedNode(object), df.namedNode(rdf + "type"), df.namedNode(datatype));
            if (datatypeCheck.length == 0) {
              vue.$bvToast.toast("The datatype of the port " + objectPort.name + " does not match the datatype of the datatype port " + datatypePort.name);
              commit("stopExecution");
              return;
            }
          } else if (literalValueQuad.length > 0) {
            object = literalValueQuad[0].object.value;
            if (datatype != literalValueQuad[0].object.datatype.value) {
              vue.$bvToast.toast("The datatype of the port " + objectPort.name + " does not match the datatype of the datatype port " + datatypePort.name);
              commit("stopExecution");
              return;
            }
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + objectPort.name + ", there is an control pipe which is illegal");
          return;
        } else if (isObjectPipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            object = hasSourceURIValue[0].object.value;
            const res = await fc.readFile(object);
            const miniStore = new N3.Store();
            const parser = new N3.Parser();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const datatypeQuad = miniStore.getQuads(null, df.namedNode(poc + "datatype"), null);
            if (datatypeQuad.length != 1 || datatypeQuad[0].object.value != datatype) {
              vue.$bvToast.toast("The object port " + objectPort.name + " has a direct pipe with a uri value that does not match the datatype");
              commit("stopExecution");
              return;
            }
          } else if (hasSourceLiteralValue.length > 0) {
            object = hasSourceLiteralValue[0].object.value;
            if (hasSourceLiteralValue[0].object.datatype.value != datatype) {
              vue.$bvToast.toast("The object port " + objectPort.name + " has a direct pipe with a literal value that does not match the datatype");
              commit("stopExecution");
              return;
            }
          } else {
            vue.$bvToast.toast("The object port " + objectPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipePortPipe.length > 0) {
          if (!(await fc.itemExists(objectPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the automation does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(objectPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
            const x = state.store.getQuads(df.namedNode(object), df.namedNode(rdf + "type"), df.namedNode(datatype));
            if (x.length == 0) {
              vue.$bvToast.toast("The datatype of the port " + objectPort.name + " does not match the datatype of the datatype port " + datatypePort.name);
              commit("stopExecution");
              return;
            }
          } else if (literalValueQuad.length > 0) {
            object = literalValueQuad[0].object.value;
            if (datatype != literalValueQuad[0].object.datatype.value) {
              vue.$bvToast.toast("The datatype of the port " + objectPort.name + " does not match the datatype of the datatype port " + datatypePort.name);
              commit("stopExecution");
              return;
            }
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + objectPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        //#endregion
        //#region Handle output port and result

        // check if there is a portpipe whose source port is this port. In this case write to the input port at the other end of the pipe 
        // check if there is a control pipe coming out of this output port. Remove the pipes accordingly. 
        let valueBindingContent;
        if (datatype.startsWith(xsd)) {
          const datatypeName = datatype.substring(datatype.lastIndexOf("#") + 1);
          valueBindingContent = constants.literalValueBinding(object, datatypeName);
        } else {
          valueBindingContent = constants.URIValueBinding(object);
        }

        let deleteTrue = true;
        if (datatype.startsWith(xsd)) {
          if (datatype == "string" && object == "") {
            deleteTrue = false;
          } else if (datatype == "boolean" && object == "false") {
            deleteTrue = false;
          } else if ((datatype == "float" || datatype == "double" || datatype == "decimal") && parseFloat(object)) {
            deleteTrue = false;
          } else if ((datatype == "integer" || datatype == "nonPositiveInteger" || datatype == "negativeInteger" || datatype == "unsignedInt" || datatype == "positiveInteger") && parseInt(object)) {
            deleteTrue = false;
          }
        }

        await dispatch("handleOutputPort", { deleteTrue: deleteTrue, vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, valueBindingContent: valueBindingContent });
        //#endregion
      }
    },
    async executeDeleteStep({ state, commit, dispatch }, { vue, stepName, workflowInstanceID, inputPorts, outputPorts, stepToRun }) {
      //#region Validation
      // A delete step has 1 inputport(name)
      const checklist = [0];
      if (inputPorts.length != 1) {
        vue.$bvToast.toast("The DeleteStep " + stepToRun + " does not have exactly 1 input port");
        commit("stopExecution");
        return;
      }
      inputPorts.forEach(i => {
        if (i.label == "name") {
          checklist[0] = 1;
        }
      });
      if (outputPorts.length != 0) {
        vue.$bvToast.toast("The DeleteStep " + stepToRun + " does not have exactly 0 output port");
        commit("stopExecution");
        return;
      }
      if (!checklist[0]) {
        vue.$bvToast.toast("The DeleteStep " + stepToRun + " does not have ports labeled correctly");
        commit("stopExecution");
        return;
      } else { // Check complete start execution
        //#endregion
        //#region Get ports and pipes of them 
        const namePort = inputPorts[0];
        const namePipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(namePort.uri));


        if (namePipe.length == 0) { // Check if there are pipes that come in to the ports 
          vue.$bvToast.toast("The DeleteStep " + stepToRun + " does not have a pipes that targets name port");
          commit("stopExecution");
          return;
        }
        const namePortPipeURI = namePipe[0].subject.value;
        const namePortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + namePort.name + ".ttl";

        let name;
        //#endregion
        //#region Name Port
        const isNamePipeHumanPipe = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isNamePipeDirectPipe = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isNamePipeControlPipe = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isNamePipePortPipe = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        if (isNamePipeHumanPipe.length > 0) { // if it is human pipe the data should be in the pod of the user
          if (!(await fc.itemExists(namePortDataLocation))) {
            commit("stopExecution");
            vue.$bvToast.toast("The inputport " + namePort.name + " that should be entered by the human does not exists.");
            return;
          }
          const res = await fc.readFile(namePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (literalValueQuad.length > 0) {
            name = literalValueQuad[0].object.value;
          } else if (uriValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + namePort.name + ", the name entered by human cannot be a uri value")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + namePort.name + ", the name entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }

        } else if (isNamePipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + namePort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isNamePipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceLiteralValue.length > 0) {
            name = hasSourceLiteralValue[0].object.value;
          } else if (hasSourceURIValue.length > 0) {
            vue.$bvToast.toast("The name port " + namePort.name + " has a direct pipe with a uri value which is wrong");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("The name port " + namePort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isNamePipePortPipe.length > 0) {
          // There should be an inputPort entry in the step instances folder. 
          if (!(await fc.itemExists(namePortDataLocation))) {
            vue.$bvToast.toast("The inputport " + namePort.name + " that should be created by automation does not exists");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(namePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (literalValueQuad.length > 0) {
            name = literalValueQuad[0].object.value;
          } else if (uriValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + namePort.name + ", the name entered by automation cannot be uri")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + namePort.name + ", the name entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + namePortPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        //#endregion
        //#region Handle output
        await fc.deleteFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${name}.ttl`);

        await dispatch("handleOutputPortSimple", { stepName: stepName, vue: vue, workflowInstanceID: workflowInstanceID });

        //#endregion
      }
    },
    async executeDisplayStep({ state, commit, dispatch }, { vue, stepName, workflowInstanceID, inputPorts, outputPorts, stepToRun }) {
      //#region Validation

      // A Display step has 1 inputport(message)
      const checklist = [0];
      if (inputPorts.length != 1) {
        vue.$bvToast.toast("The DisplayStep " + stepToRun + " does not have exactly 1 input port");
        commit("stopExecution");
        return;
      }
      inputPorts.forEach(i => {
        if (i.label == "message") {
          checklist[0] = 1;
        }
      });
      if (outputPorts.length != 0) {
        vue.$bvToast.toast("The DisplayStep " + stepToRun + " does not have exactly 0 output port");
        commit("stopExecution");
        return;
      }

      if (!checklist[0]) {
        vue.$bvToast.toast("The DisplayStep " + stepToRun + " does not have ports labeled correctly");
        commit("stopExecution");
        return;
      } else { // Check complete start execution
        //#endregion
        //#region Get ports and pipes of them 
        const messagePort = inputPorts[0];
        const messagePortPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(messagePort.uri));

        if (messagePortPipe.length == 0) { // Check if there are pipes that come in to the ports 
          vue.$bvToast.toast("The DisplayStep " + stepToRun + " does not have a pipe that targets message port");
          commit("stopExecution");
          return;
        }
        const messagePortPipeURI = messagePortPipe[0].subject.value;
        const messagePortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + messagePort.name + ".ttl";

        let message;

        //#endregion
        //#region Message Port
        const isMessagePipeHumanPipe = state.store.getQuads(df.namedNode(messagePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isMessagePipeDirectPipe = state.store.getQuads(df.namedNode(messagePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isMessagePipeControlPipe = state.store.getQuads(df.namedNode(messagePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isMessagePipePortPipe = state.store.getQuads(df.namedNode(messagePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        if (isMessagePipeHumanPipe.length > 0) { // if it is human pipe the data should be in the pod of the user
          if (!(await fc.itemExists(messagePortDataLocation))) {
            commit("stopExecution");
            vue.$bvToast.toast("The inputport " + messagePort.name + " that should be entered by the human does not exists.");
            return;
          }
          const res = await fc.readFile(messagePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (literalValueQuad.length > 0) {
            message = literalValueQuad[0].object.value;
          } else if (uriValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + messagePort.name + ", the message entered by human cannot be a uri value")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + messagePort.name + ", the message entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }

        } else if (isMessagePipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + messagePort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isMessagePipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(messagePortPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(messagePortPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceLiteralValue.length > 0) {
            message = hasSourceLiteralValue[0].object.value;
          } else if (hasSourceURIValue.length > 0) {
            vue.$bvToast.toast("The message port " + messagePort.name + " has a direct pipe with a uri value which is wrong");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("The message port " + messagePort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isMessagePipePortPipe.length > 0) {
          // There should be an inputPort entry in the step instances folder. 
          if (!(await fc.itemExists(messagePortDataLocation))) {
            vue.$bvToast.toast("The inputport " + messagePort.name + " that should be created by automation does not exists");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(messagePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (literalValueQuad.length > 0) {
            message = literalValueQuad[0].object.value;
          } else if (uriValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + messagePort.name + ", the message entered by automation cannot be uri")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + messagePort.name + ", the message entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + messagePortPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        //#endregion
        //#region Handle output

        vue.$bvToast.toast("Application Message: " + message);

        await dispatch("handleOutputPortSimple", { stepName: stepName, vue: vue, workflowInstanceID: workflowInstanceID });

      }
      //#endregion
    },
    async executeEvaluateStep({ state, commit, dispatch }, { vue, stepName, workflowInstanceID, inputPorts, outputPorts, stepToRun }) {
      //#region Validation

      // A evaluate step has 1 inputport(object) and an output port(result)
      const checklist = [0, 0];
      if (inputPorts.length != 1) {
        vue.$bvToast.toast("The EvaluateStep " + stepToRun + " does not have exactly 1 input port");
        commit("stopExecution");
        return;
      }
      inputPorts.forEach(i => {
        if (i.label == "object") {
          checklist[0] = 1;
        }
      });
      if (outputPorts.length != 1) {
        vue.$bvToast.toast("The EvaluateStep " + stepToRun + " does not have exactly 1 output port");
        commit("stopExecution");
        return;
      }
      outputPorts.forEach(i => {
        if (i.label == "result") {
          checklist[1] = 1;
        }
      });
      if (!checklist[0] || !checklist[1]) {
        vue.$bvToast.toast("The EvaluateStep " + stepToRun + " does not have ports labeled correctly");
        commit("stopExecution");
        return;
      } else { // Check complete start execution


        //#endregion
        //#region Get ports and pipes of them 

        let objectPort = inputPorts[0];
        let objectPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(objectPort.uri));

        if (objectPipe.length == 0) { // Check if there are pipes that come in to the ports 
          vue.$bvToast.toast("The EvaluateStep " + stepToRun + " does not have a pipe that targets object port");
          commit("stopExecution");
          return;
        }

        const objectPipeURI = objectPipe[0].subject.value;

        let object;

        const objectPortDataLocation = `${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${objectPort.name}.ttl`

        //#endregion
        //#region Object Port
        if (objectPipeURI != "") {
          const isObjectPipeHumanPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
          const isObjectPipeDirectPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
          const isObjectPipeControlPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
          const isObjectPipePortPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

          if (isObjectPipeHumanPipe.length > 0) {
            if (!(await fc.itemExists(objectPortDataLocation))) {
              vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the human does not exists.");
              commit("stopExecution");
              return;
            }
            const res = await fc.readFile(objectPortDataLocation);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
            const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
            if (uriValueQuad.length > 0) {
              vue.$bvToast.toast("Into inputport " + objectPort.name + ", the expression entered by human cannot be a uri")
              commit("stopExecution");
              return;
            } else if (literalValueQuad.length > 0) {
              object = literalValueQuad[0].object.value;
            } else {
              vue.$bvToast.toast("Into inputport " + objectPort.name + ", the expression entered by human is possibly empty or malformed")
              commit("stopExecution");
              return;
            }
          } else if (isObjectPipeControlPipe.length > 0) {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", there is an control pipe which is illegal");
            commit("stopExecution");
            return;
          } else if (isObjectPipeDirectPipe.length > 0) {
            const hasSourceURIValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceUriValue"), null);
            const hasSourceLiteralValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
            if (hasSourceURIValue.length > 0) {
              vue.$bvToast.toast("Into inputport " + objectPort.name + ", the expression entered by direct pipe cannot be a uri")
              commit("stopExecution");
              return;
            } else if (hasSourceLiteralValue.length > 0) {
              object = hasSourceLiteralValue[0].object.value;
            } else {
              vue.$bvToast.toast("The object port " + objectPort.name + " has a direct pipe without a value");
              commit("stopExecution");
              return;
            }
          } else if (isObjectPipePortPipe.length > 0) {
            if (!(await fc.itemExists(objectPortDataLocation))) {
              vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the automation does not exists.");
              commit("stopExecution");
              return;
            }
            const res = await fc.readFile(objectPortDataLocation);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
            const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
            if (uriValueQuad.length > 0) {
              vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by automation cannot be a uri")
              commit("stopExecution");
              return;
            } else if (literalValueQuad.length > 0) {
              object = literalValueQuad[0].object.value;
            } else {
              vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by automation is possibly empty or malformed")
              commit("stopExecution");
              return;
            }
          } else {
            vue.$bvToast.toast("The type of pipe " + objectPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
            commit("stopExecution");
            return;
          }
        }


        //#endregion
        //#region Handle output port and result

        const regex = /@\w*/g;
        let res;
        let vars = []
        while ((res = regex.exec(object)) !== null) {
          vars.push({
            name: res[0]
          });
        }
        for (const variable of vars) {
          if (!(await (fc.itemExists(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${variable.name.substring(1)}.ttl`)))) {
            vue.$bvToast.toast(`The variable ${variable.name} needed to execute the expression ${object} does not exists in the pod. Save it first`)
            commit("stopExecution")
            return;
          }
          let value;
          let datatype;
          const res = await fc.readFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${variable.name.substring(1)}.ttl`);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, poc + "uriValue", null);
          const literalValueQuad = miniStore.getQuads(null, poc + "literalValue", null);


          if (uriValueQuad.length > 0) {
            value = uriValueQuad[0].object.value; // Only allow this in case of a data instance
          } else if (literalValueQuad.length > 0) {
            value = literalValueQuad[0].object.value;
            datatype = literalValueQuad[0].object.datatype.value;
          } else {
            vue.$bvToast.toast(`The value ${variable.name}'s value in expression ${object} is not literal value or uri value.`)
            commit("stopExecution");
            return;
          }

          if (datatype) { // literal
            if (datatype == xsd + "dateTime") {
              object = object.split(variable.name).join(`new Date("${value}")`);
            } else if (datatype == xsd + "string") {
              object = object.split(variable.name).join(`"${value}"`);
            } else {
              object = object.split(variable.name).join(`${value}`);
            }
          } else { // uri, must be a data instance or a list
            if (value.startsWith(appOntology)) { // a list
              const isList = state.store.getQuads(df.namedNode(value), df.namedNode(rdf + "type"), df.namedNode(poc + "List"));
              if (isList.length > 0) {
                await dispatch("fetchAllLists");
                const listName = value.substring(value.lastIndexOf("#") + 1);
                let theList;
                for (const list of state.lists) {
                  if (list.listName == appOntology + listName) theList = list.list;
                }
                let arrayString = "[";
                if (theList.length == 0) arrayString = "[]";
                else {
                  for (const item of theList) {
                    if (N3.Util.isNamedNode(item)) {
                      arrayString += "'" + item.value + "'" + ",";
                    } else if (N3.Util.isLiteral(item)) {
                      let thing;
                      if (item.datatype.value == xsd + "dateTime") {
                        thing = `new Date("${value}"),`;
                      } else if (item.datatype.value == xsd + "string") {
                        thing = `"${value}",`;
                      } else {
                        thing = `${value},`;
                      }
                      arrayString += thing;
                    } else if (N3.Util.isBlankNode(item)) {
                      vue.$bvToast.toast("The list " + listName + " includes blank node which is illegal");
                      commit("stopExecution");
                      return;
                    } else {
                      vue.$bvToast.toast("The list " + listName + " includes a node that is not a blank, literal or a namedNode");
                      commit("stopExecution");
                      return;
                    }
                  }
                  arrayString = arrayString.substring(0, arrayString.length - 1);
                  arrayString += "]";
                }

                object = object.split(variable.name).join(arrayString);
              } else {
                vue.$bvToast.toast("In evalueate a variable is not a list and not a data instance, though is a uri");
                commit("stopExecution");
                return;
              }

            } else {
              let exists;
              try {
                exists = await fc.itemExists(value);
              } catch (error) {
                vue.$bvToast.toast("Malformed uri for expression or cannot reach it , only data instance uris allowed " + value)
                commit("stopExecution");
                return;
              }
              if (exists) {
                const res = await fc.readFile(value);
                const parser = new N3.Parser();
                const quads = parser.parse(res);
                const miniStore = new N3.Store();
                miniStore.addQuads(quads);
                const fieldValueQuads = miniStore.getQuads(null, df.namedNode(poc + "fieldValue"), null);
                let objectString = "({";
                for (const quad of fieldValueQuads) {
                  const labelQuad = miniStore.getQuads(quad.object, df.namedNode(rdfs + "label"), null);
                  const literalValueQuad = miniStore.getQuads(quad.object, df.namedNode(poc + "literalValue"), null);

                  if (literalValueQuad.length == 0) {
                    vue.$bvToast.toast("In the expressions, you cannot reach fields whose value is uri value. ");
                    commit("stopExecution");
                    return;
                  }

                  if (labelQuad.length == 0) {
                    vue.$bvToast.toast("The data instance that is reached in the expression does not have a label in one of its labels");
                    commit("stopExecution");
                    return;
                  }

                  let value = literalValueQuad[0].object.value;
                  let datatype = literalValueQuad[0].object.datatype.value;

                  if (datatype == xsd + "dateTime") {
                    objectString += `${labelQuad[0].object.value}: new Date("${value}"),`;
                  } else if (datatype == xsd + "string" || datatype == xsd + "anyURI") {
                    objectString += `${labelQuad[0].object.value}: "${value}",`
                  } else {
                    objectString += `${labelQuad[0].object.value}: ${value},`
                  }
                }
                objectString = objectString.substring(0, objectString.length - 1);
                objectString += "})";
                object = object.split(variable.name).join(objectString);

              } else {
                vue.$bvToast.toast("The data instance " + value + " does not exists. But used in an expression. ");
                commit("stopExecution");
                return;
              }
            }

          }
        }
        console.log("Evaluating " + object);
        const result = eval(object);
        let datatype;

        if (Number.isSafeInteger(result)) {
          datatype = "integer";
        } else if (typeof result == "number") {
          datatype = "float";
        } else if (typeof result == "string") {
          datatype = "string";
        } else if (result instanceof Date) {
          datatype = "dateTime";
        } else if (typeof result == "boolean") {
          datatype = "boolean";
        }

        let valueBindingContent = constants.literalValueBinding(result, datatype);

        await dispatch("handleOutputPort", { deleteTrue: result, vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, valueBindingContent: valueBindingContent });
        //#endregion
      }
    },
    async executeFilterStep({ state, commit, dispatch }, { vue, stepName, workflowInstanceID, inputPorts, outputPorts, stepToRun }) {
      //#region Validation
      // A filter step has 2 inputports(condition, object) and an output port(result)
      const checklist = [0, 0, 0];
      if (inputPorts.length != 2) {
        vue.$bvToast.toast("The FilterStep " + stepToRun + " does not have exactly 2 input ports");
        commit("stopExecution");
        return;
      }
      inputPorts.forEach(i => {
        if (i.label == "condition") {
          checklist[0] = 1;
        } else if (i.label == "object") {
          checklist[1] = 1;
        }
      });
      if (outputPorts.length != 1) {
        vue.$bvToast.toast("The FilterStep " + stepToRun + " does not have exactly 1 output port");
        commit("stopExecution");
        return;
      }
      outputPorts.forEach(i => {
        if (i.label == "result") {
          checklist[2] = 1;
        }
      });
      if (!checklist[0] || !checklist[1] || !checklist[2]) {
        vue.$bvToast.toast("The FilterStep " + stepToRun + " does not have ports labeled correctly");
        commit("stopExecution");
        return;
      } else { // Check complete start execution
        //#endregion
        //#region Get ports and pipes of them 

        let objectPort;
        let conditionPort;

        for (const port of inputPorts) {
          if (port.label == "object") {
            objectPort = port;
          } else if (port.label == "condition") {
            conditionPort = port;
          }
        }
        let objectPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(objectPort.uri));
        let conditionPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(conditionPort.uri));

        if (objectPipe.length == 0 || conditionPipe.length == 0) { // Check if there are pipes that come in to the ports 
          vue.$bvToast.toast("The FilterStep " + stepToRun + " does not have pipes that targets both object and condition ports");
          commit("stopExecution");
          return;
        }
        const objectPipeURI = objectPipe[0].subject.value;
        const conditionPipeURI = conditionPipe[0].subject.value;


        let object;
        let condition;

        const objectPortDataLocation = `${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${objectPort.name}.ttl`
        const conditionPortDataLocation = `${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${conditionPort.name}.ttl`

        //#endregion
        //#region Object Port
        const isObjectPipeHumanPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isObjectPipeDirectPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isObjectPipeControlPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isObjectPipePortPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        if (isObjectPipeHumanPipe.length > 0) { // if it is human pipe the data should be in the pod of the user
          if (!(await fc.itemExists(objectPortDataLocation))) {
            commit("stopExecution");
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the human does not exists.");
            return;
          }
          const res = await fc.readFile(objectPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("In an FilterStep into inputport " + objectPort.name + ", the target entered by human cannot be literal")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("In an FilterStep into inputport " + objectPort.name + ", the datatype entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }

        } else if (isObjectPipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + objectPort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isObjectPipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            object = hasSourceURIValue[0].object.value;
          } else if (hasSourceLiteralValue.length > 0) {
            vue.$bvToast.toast("The datatype port " + objectPort.name + " has a direct pipe with a literal value which is wrong");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("The datatype port " + objectPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipePortPipe.length > 0) {
          // There should be an inputPort entry in the step instances folder. 
          if (!(await fc.itemExists(objectPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be created by automation does not exists");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(objectPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the target entered by automation cannot be literal")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the target entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + objectPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }

        //#endregion
        //#region Condition Port
        const isConditionPipeHumanPipe = state.store.getQuads(df.namedNode(conditionPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isConditionPipeDirectPipe = state.store.getQuads(df.namedNode(conditionPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isConditionPipeControlPipe = state.store.getQuads(df.namedNode(conditionPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isConditionPipePortPipe = state.store.getQuads(df.namedNode(conditionPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        if (isConditionPipeHumanPipe.length > 0) {
          if (!(await fc.itemExists(conditionPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + conditionPort.name + " that should be entered by the human does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(conditionPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + conditionPort.name + ", the index entered by human cannot be a uri")
            commit("stopExecution");
            return;
          } else if (literalValueQuad.length > 0) {
            condition = literalValueQuad[0].object.value;
          } else {
            vue.$bvToast.toast("Into inputport " + conditionPort.name + ", the index entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else if (isConditionPipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + conditionPort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isConditionPipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(conditionPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(conditionPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            vue.$bvToast.toast("Into inputport " + conditionPort.name + ", the index entered by direct pipe cannot be a uri")
            commit("stopExecution");
            return;
          } else if (hasSourceLiteralValue.length > 0) {
            condition = hasSourceLiteralValue[0].object.value;
          } else {
            vue.$bvToast.toast("The index port " + conditionPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isConditionPipePortPipe.length > 0) {
          if (!(await fc.itemExists(conditionPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + conditionPort.name + " that should be entered by the automation does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(conditionPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + conditionPort.name + ", the index entered by automation cannot be a uri")
            commit("stopExecution");
            return;
          } else if (literalValueQuad.length > 0) {
            condition = literalValueQuad[0].object.value;
          } else {
            vue.$bvToast.toast("Into inputport " + conditionPort.name + ", the object entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + conditionPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }


        //#endregion
        //#region Handle output port and result

        let listName = object.substring(object.lastIndexOf("#") + 1);
        let list = [];
        const miniStore = new N3.Store();
        if (object.startsWith(appOntology)) {
          await dispatch("fetchAllLists");
          for (const l of state.lists) {
            if (l.listName.substring(l.listName.lastIndexOf("#") + 1) == listName) {
              list = l.list;
            }
          }
        } else {

          try {
            const res = await fc.readFile(object);
            const parser = new N3.Parser();
            let headOfList;
            const quadsParsed = parser.parse(res);
            miniStore.addQuads(quadsParsed);

            const isList = miniStore.getQuads(null, df.namedNode(rdf + "type"), df.namedNode(poc + "List"));

            if (isList.length == 0) {
              vue.$bvToast.toast("Error FilterStep's source port has a uri value that is not a list");
              commit("stopExecution");
              return;
            }
            const isListEmpty = miniStore.getQuads(null, df.namedNode(poc + "items"), rdf + "nil");

            if (isListEmpty.length == 0) {
              let listHeadQuads = miniStore.getQuads(null, df.namedNode(rdf + "first"), null);

              // Filter out the ones that are rest of some node to find real head of lists
              listHeadQuads = listHeadQuads.filter(item => {
                return miniStore.getQuads(null, df.namedNode(rdf + "rest"), df.blankNode(item.subject.value)).length == 0;
              });
              if (listHeadQuads.length != 1) {
                vue.$bvToast.toast(`The list ${listName} does not have a poc:items in it properly`);
                commit("stopExecution");
                return;
              }
              headOfList = listHeadQuads[0];
              let current = headOfList.subject.value;
              let quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
              while (quads.length > 0 && quads[0].object.value != rdf + "nil") {
                const obj = quads[0].object;
                list.push(obj);
                let rest = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "rest"), null);
                current = rest[0].object.value;
                if (current == rdf + "nil") break;
                quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
              }
            }
          } catch (error) {
            vue.$bvToast.toast(`Can't read ${object}`);
            commit("stopExecution");
            return;
          }
        }
        const writer = new N3.Writer({ prefixes: { rdf: rdf, xsd: xsd, poc: poc, dcterms: dcterms, rdfs: rdfs, owl: owl, appOntology: appOntology } });

        if (object.startsWith(appOntology)) {
          const res = await fc.readFile(`${state.userRoot}/poc/data_instances/${listName}.ttl`);
          const parser = new N3.Parser();
          const quadsParsed = parser.parse(res);
          miniStore.addQuads(quadsParsed);
        }
        const typeQuads = miniStore.getQuads(null, df.namedNode(rdf + "type"), null);
        const labelQuads = miniStore.getQuads(null, df.namedNode(rdfs + "label"), null);
        const descriptionQuads = miniStore.getQuads(null, df.namedNode(dcterms + "description"), null);
        const createdQuads = miniStore.getQuads(null, df.namedNode(dcterms + "created"), null);
        const creatorQuads = miniStore.getQuads(null, df.namedNode(dcterms + "creator"), null);

        writer.addQuads(typeQuads);
        writer.addQuads(labelQuads);
        writer.addQuads(descriptionQuads);
        if (!object.startsWith(appOntology)) writer.addQuads(createdQuads);
        writer.addQuads(creatorQuads);

        let newList = [];
        for (const l of list) {
          let newCondition = condition;

          const regex = /@\w*/g;
          let res;
          let vars = [];
          while ((res = regex.exec(newCondition)) !== null) {
            vars.push({
              name: res[0]
            });
          }

          for (const variable of vars) {
            if (variable.name == "@item") continue;
            if (!(await (fc.itemExists(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${variable.name.substring(1)}.ttl`)))) {
              vue.$bvToast.toast(`The variable ${variable.name} needed to execute the expression ${newCondition} does not exists in the pod. Save it first`)
              commit("stopExecution")
              return;
            }
            let value;
            let datatype;
            const res = await fc.readFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${variable.name.substring(1)}.ttl`);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, poc + "uriValue", null);
            const literalValueQuad = miniStore.getQuads(null, poc + "literalValue", null);


            if (uriValueQuad.length > 0) {
              value = uriValueQuad[0].object.value; // Only allow this in case of a data instance
            } else if (literalValueQuad.length > 0) {
              value = literalValueQuad[0].object.value;
              datatype = literalValueQuad[0].object.datatype.value;
            } else {
              vue.$bvToast.toast(`The value ${variable.name}'s value in expression ${newCondition} is not literal value or uri value.`)
              commit("stopExecution");
              return;
            }

            if (datatype) { // literal
              if (datatype == xsd + "dateTime") {
                newCondition = newCondition.split(variable.name).join(`new Date("${value}")`);
              } else if (datatype == xsd + "string") {
                newCondition = newCondition.split(variable.name).join(`"${value}"`);
              } else {
                newCondition = newCondition.split(variable.name).join(`${value}`);
              }
            } else { // uri, must be a data instance or a list
              if (value.startsWith(appOntology)) { // a list
                const isList = state.store.getQuads(df.namedNode(value), df.namedNode(rdf + "type"), df.namedNode(poc + "List"));
                if (isList.length > 0) {
                  await dispatch("fetchAllLists");
                  const listName = value.substring(value.lastIndexOf("#") + 1);
                  let theList;
                  for (const list of state.lists) {
                    if (list.listName == appOntology + listName) theList = list.list;
                  }
                  let arrayString = "[";
                  if (theList.length == 0) arrayString = "[]";
                  else {
                    for (const item of theList) {
                      if (N3.Util.isNamedNode(item)) {
                        arrayString += "'" + item.value + "'" + ",";
                      } else if (N3.Util.isLiteral(item)) {
                        let thing;
                        if (item.datatype.value == xsd + "dateTime") {
                          thing = `new Date("${value}"),`;
                        } else if (item.datatype.value == xsd + "string") {
                          thing = `"${value}",`;
                        } else {
                          thing = `${value},`;
                        }
                        arrayString += thing;
                      } else if (N3.Util.isBlankNode(item)) {
                        vue.$bvToast.toast("The list " + listName + " includes blank node which is illegal");
                        commit("stopExecution");
                        return;
                      } else {
                        vue.$bvToast.toast("The list " + listName + " includes a node that is not a blank, literal or a namedNode");
                        commit("stopExecution");
                        return;
                      }
                    }
                    arrayString = arrayString.substring(0, arrayString.length - 1);
                    arrayString += "]";
                  }

                  newCondition = newCondition.split(variable.name).join(arrayString);
                } else {
                  vue.$bvToast.toast("In evalueate a variable is not a list and not a data instance, though is a uri");
                  commit("stopExecution");
                  return;
                }

              } else {
                let exists;
                try {
                  exists = await fc.itemExists(value);
                } catch (error) {
                  vue.$bvToast.toast("Malformed uri for expression or cannot reach it , only data instance uris allowed " + value)
                  commit("stopExecution");
                  return;
                }
                if (exists) {
                  const res = await fc.readFile(value);
                  const parser = new N3.Parser();
                  const quads = parser.parse(res);
                  const miniStore = new N3.Store();
                  miniStore.addQuads(quads);
                  const fieldValueQuads = miniStore.getQuads(null, df.namedNode(poc + "fieldValue"), null);
                  let objectString = "({";
                  for (const quad of fieldValueQuads) {
                    const labelQuad = miniStore.getQuads(quad.object, df.namedNode(rdfs + "label"), null);
                    const literalValueQuad = miniStore.getQuads(quad.object, df.namedNode(poc + "literalValue"), null);

                    if (literalValueQuad.length == 0) {
                      vue.$bvToast.toast("In the expressions, you cannot reach fields whose value is uri value. ");
                      commit("stopExecution");
                      return;
                    }

                    if (labelQuad.length == 0) {
                      vue.$bvToast.toast("The data instance that is reached in the expression does not have a label in one of its labels");
                      commit("stopExecution");
                      return;
                    }

                    let value = literalValueQuad[0].object.value;
                    let datatype = literalValueQuad[0].object.datatype.value;

                    if (datatype == xsd + "dateTime") {
                      objectString += `${labelQuad[0].object.value}: new Date("${value}"),`;
                    } else if (datatype == xsd + "string" || datatype == xsd + "anyURI") {
                      objectString += `${labelQuad[0].object.value}: "${value}",`
                    } else {
                      objectString += `${labelQuad[0].object.value}: ${value},`
                    }
                  }
                  objectString = objectString.substring(0, objectString.length - 1);
                  objectString += "})";
                  newCondition = newCondition.split(variable.name).join(objectString);

                } else {
                  vue.$bvToast.toast("The data instance " + value + " does not exists. But used in an expression. ");
                  commit("stopExecution");
                  return;
                }
              }

            }
          }

          const isLiteral = N3.Util.isLiteral(l);
          const isNamedNode = N3.Util.isNamedNode(l);

          let value, datatype;

          if (isLiteral) {
            value = l.value;
            datatype = l.datatype.value;
          } else if (isNamedNode) {
            value = l.value;
          } else {
            vue.$bvToast.toast("An item in list must be a literal or a uri value in this application.")
            commit("stopExecution")
            return;
          }

          if (datatype) { // literal
            if (datatype == xsd + "dateTime") {
              newCondition = newCondition.split("@item").join(`new Date("${value}")`);
            } else if (datatype == xsd + "string") {
              newCondition = newCondition.split("@item").join(`"${value}"`);
            } else {
              newCondition = newCondition.split("@item").join(`${value}`);
            }
          } else { // uri, must be a data instance or a list
            if (value.startsWith(appOntology)) { // a list
              const isList = state.store.getQuads(df.namedNode(value), df.namedNode(rdf + "type"), df.namedNode(poc + "List"));
              if (isList.length > 0) {
                await dispatch("fetchAllLists");
                const listName = value.substring(value.lastIndexOf("#") + 1);
                let theList;
                for (const list of state.lists) {
                  if (list.listName == appOntology + listName) theList = list.list;
                }
                let arrayString = "[";
                if (theList.length == 0) arrayString = "[]";
                else {
                  for (const item of theList) {
                    if (N3.Util.isNamedNode(item)) {
                      arrayString += "'" + item.value + "'" + ",";
                    } else if (N3.Util.isLiteral(item)) {
                      let thing;
                      if (item.datatype.value == xsd + "dateTime") {
                        thing = `new Date("${value}"),`;
                      } else if (item.datatype.value == xsd + "string") {
                        thing = `"${value}",`;
                      } else {
                        thing = `${value},`;
                      }
                      arrayString += thing;
                    } else if (N3.Util.isBlankNode(item)) {
                      vue.$bvToast.toast("The list " + listName + " includes blank node which is illegal");
                      commit("stopExecution");
                      return;
                    } else {
                      vue.$bvToast.toast("The list " + listName + " includes a node that is not a blank, literal or a namedNode");
                      commit("stopExecution");
                      return;
                    }
                  }
                  arrayString = arrayString.substring(0, arrayString.length - 1);
                  arrayString += "]";
                }

                newCondition = newCondition.split("@item").join(arrayString);
              } else {
                vue.$bvToast.toast("In filter step's list a variable is not a list and not a data instance, though is a uri");
                commit("stopExecution");
                return;
              }

            } else {
              let exists;
              try {
                exists = await fc.itemExists(value);
              } catch (error) {
                vue.$bvToast.toast("Malformed uri for expression or cannot reach it , only data instance uris allowed " + value)
                commit("stopExecution");
                return;
              }
              if (exists) {
                const res = await fc.readFile(value);
                const parser = new N3.Parser();
                const quads = parser.parse(res);
                const miniStore = new N3.Store();
                miniStore.addQuads(quads);
                const fieldValueQuads = miniStore.getQuads(null, df.namedNode(poc + "fieldValue"), null);
                let objectString = "({";
                for (const quad of fieldValueQuads) {
                  const labelQuad = miniStore.getQuads(quad.object, df.namedNode(rdfs + "label"), null);
                  const literalValueQuad = miniStore.getQuads(quad.object, df.namedNode(poc + "literalValue"), null);

                  if (literalValueQuad.length == 0) {
                    vue.$bvToast.toast("In the expressions, you cannot reach fields whose value is uri value. ");
                    commit("stopExecution");
                    return;
                  }

                  if (labelQuad.length == 0) {
                    vue.$bvToast.toast("The data instance that is reached in the expression does not have a label in one of its labels");
                    commit("stopExecution");
                    return;
                  }

                  let value = literalValueQuad[0].object.value;
                  let datatype = literalValueQuad[0].object.datatype.value;

                  if (datatype == xsd + "dateTime") {
                    objectString += `${labelQuad[0].object.value}: new Date("${value}"),`;
                  } else if (datatype == xsd + "string" || datatype == xsd + "anyURI") {
                    objectString += `${labelQuad[0].object.value}: "${value}",`
                  } else {
                    objectString += `${labelQuad[0].object.value}: ${value},`
                  }
                }
                objectString = objectString.substring(0, objectString.length - 1);
                objectString += "})";
                newCondition = newCondition.split("@item").join(objectString);

              } else {
                vue.$bvToast.toast("The data instance " + value + " does not exists. But used in an expression. ");
                commit("stopExecution");
                return;
              }
            }
          }
          let takeIn;
          try {
            console.log("Evaluating" + newCondition);
            console.log(l.value + " " + eval(newCondition));
            takeIn = eval(newCondition);
          } catch (error) {
            console.log(error);
          }
          if (takeIn) newList.push(l);
        }
        list = newList;

        writer.addQuad(df.namedNode(appOntology + listName), df.namedNode(poc + "items"), writer.list(list));

        writer.end(async (err, result) => {
          if (err) {
            vue.$bvToast.toast(`An error occured in writer`);
            commit("stopExecution");
            return;
          }
          const randomStringForNewList = generateRandomString();
          await fc.createFile(`${state.userRoot}/poc/data_instances/${randomStringForNewList}_${listName}.ttl`, result, "text/turtle");

          // check if there is a portpipe whose source port is this port. In this case write to the input port at the other end of the pipe 
          // check if there is a control pipe coming out of this output port. Remove the pipes accordingly. 
          let valueBindingContent = constants.URIValueBinding(`${state.userRoot}/poc/data_instances/${randomStringForNewList}_${listName}.ttl`);


          await dispatch("handleOutputPort", { deleteTrue: true, vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, valueBindingContent: valueBindingContent });
        });
        //#endregion
      }
    },
    async executeGetStep({ state, commit, dispatch }, { vue, stepName, workflowInstanceID, inputPorts, outputPorts, stepToRun }) {
      //#region Validation

      // A get step has 2 inputports(index, source) and an output port(result)
      const checklist = [0, 0, 0];
      if (inputPorts.length != 2) {
        vue.$bvToast.toast("The GetStep " + stepToRun + " does not have exactly 2 input ports");
        commit("stopExecution");
        return;
      }
      inputPorts.forEach(i => {
        if (i.label == "index") {
          checklist[0] = 1;
        } else if (i.label == "source") {
          checklist[1] = 1;
        }
      });
      if (outputPorts.length != 1) {
        vue.$bvToast.toast("The GetStep " + stepToRun + " does not have exactly 1 output port");
        commit("stopExecution");
        return;
      }
      outputPorts.forEach(i => {
        if (i.label == "result") {
          checklist[2] = 1;
        }
      });
      if (!checklist[0] || !checklist[1] || !checklist[2]) {
        vue.$bvToast.toast("The GetStep " + stepToRun + " does not have ports labeled correctly");
        commit("stopExecution");
        return;
      } else { // Check complete start execution
        //#endregion
        //#region Get ports and pipes of them 
        const indexPort = inputPorts[0].label == "index" ? inputPorts[0] : inputPorts[1];
        const sourcePort = inputPorts[0].label == "source" ? inputPorts[0] : inputPorts[1];
        const indexPortPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(indexPort.uri));
        const sourcePortPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(sourcePort.uri));

        if (indexPortPipe.length == 0 || sourcePortPipe.length == 0) { // Check if there are pipes that come in to the ports 
          vue.$bvToast.toast("The GetStep " + stepToRun + " does not have pipes that targets both index and source ports");
          commit("stopExecution");
          return;
        }
        const indexPortPipeURI = indexPortPipe[0].subject.value;
        const sourcePortPipeURI = sourcePortPipe[0].subject.value;
        const indexPortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + indexPort.name + ".ttl";
        const sourcePortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + sourcePort.name + ".ttl";

        let index;
        let source;
        let result;

        //#endregion
        //#region Index Port
        const isIndexPipeHumanPipe = state.store.getQuads(df.namedNode(indexPortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isIndexPipeDirectPipe = state.store.getQuads(df.namedNode(indexPortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isIndexPipeControlPipe = state.store.getQuads(df.namedNode(indexPortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isIndexPipePortPipe = state.store.getQuads(df.namedNode(indexPortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        if (isIndexPipeHumanPipe.length > 0) { // if it is human pipe the data should be in the pod of the user
          if (!(await fc.itemExists(indexPortDataLocation))) {
            commit("stopExecution");
            vue.$bvToast.toast("The inputport " + indexPort.name + " that should be entered by the human does not exists.");
            return;
          }
          const res = await fc.readFile(indexPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (literalValueQuad.length > 0) {
            try {
              index = parseInt(literalValueQuad[0].object.value);
            } catch (error) {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by human is not a number")
              commit("stopExecution");
              return;
            }
          } else if (uriValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by human cannot be a uri value")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }

        } else if (isIndexPipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + indexPort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isIndexPipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(indexPortPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(indexPortPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceLiteralValue.length > 0) {
            try {
              index = parseInt(hasSourceLiteralValue[0].object.value);
            } catch (error) {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by direct pipe is not a number")
              commit("stopExecution");
              return;
            }
          } else if (hasSourceURIValue.length > 0) {
            vue.$bvToast.toast("The index port " + indexPort.name + " has a direct pipe with a uri value which is wrong");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("The index port " + indexPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isIndexPipePortPipe.length > 0) {
          // There should be an inputPort entry in the step instances folder. 
          if (!(await fc.itemExists(indexPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + indexPort.name + " that should be created by automation does not exists");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(indexPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (literalValueQuad.length > 0) {
            try {
              index = parseInt(literalValueQuad[0].object.value);
            } catch (error) {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by automation pipe is not a number")
              commit("stopExecution");
              return;
            }
          } else if (uriValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by automation cannot be uri")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + indexPortPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        //#endregion
        //#region Source Port 
        const isSourcePipeHumanPipe = state.store.getQuads(df.namedNode(sourcePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isSourcePipeDirectPipe = state.store.getQuads(df.namedNode(sourcePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isSourcePipeControlPipe = state.store.getQuads(df.namedNode(sourcePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isSourcePipePortPipe = state.store.getQuads(df.namedNode(sourcePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));


        if (isSourcePipeHumanPipe.length > 0) {
          if (!(await fc.itemExists(sourcePortDataLocation))) {
            vue.$bvToast.toast("The inputport " + sourcePort.name + " that should be entered by the human does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(sourcePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            source = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("The source input port " + sourcePort.name + " cannot have a literal value (human input)");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + sourcePort.name + ", the source entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else if (isSourcePipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + indexPort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isSourcePipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(sourcePortPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(sourcePortPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            source = hasSourceURIValue[0].object.value;
          } else if (hasSourceLiteralValue.length > 0) {
            vue.$bvToast.toast("The source input port " + sourcePort.name + " cannot have a literal value (direct pipe)");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("The source port " + indexPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isSourcePipePortPipe.length > 0) {
          if (!(await fc.itemExists(sourcePortDataLocation))) {
            vue.$bvToast.toast("The inputport " + sourcePort.name + " that should be entered by the automation does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(sourcePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            source = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("The source input port " + sourcePort.name + " cannot have a literal value (automation)");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + sourcePort.name + ", the source entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + sourcePortPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }


        //#endregion
        //#region Handle output port and result
        const outputPort = outputPorts[0];

        //#region Compute the result in the list

        let listName = source.substring(source.lastIndexOf("#") + 1);
        let list = [];
        const miniStore = new N3.Store();
        if (source.startsWith(appOntology)) {
          await dispatch("fetchAllLists");
          for (const l of state.lists) {
            if (l.listName.substring(l.listName.lastIndexOf("#") + 1) == listName) {
              list = l.list;
            }
          }
        }
        else {
          try {
            const res = await fc.readFile(source);
            const parser = new N3.Parser();
            let headOfList;
            const quadsParsed = parser.parse(res);
            miniStore.addQuads(quadsParsed);

            const isList = miniStore.getQuads(null, df.namedNode(rdf + "type"), df.namedNode(poc + "List"));

            if (isList.length == 0) {
              vue.$bvToast.toast("Error getstep's source port has a uri value that is not a list");
              commit("stopExecution");
              return;
            }
            const isListEmpty = miniStore.getQuads(null, df.namedNode(poc + "items"), rdf + "nil");

            if (isListEmpty.length == 0) { // If not empty 
              let listHeadQuads = miniStore.getQuads(null, df.namedNode(rdf + "first"), null);

              // Filter out the ones that are rest of some node to find real head of lists
              listHeadQuads = listHeadQuads.filter(item => {
                return miniStore.getQuads(null, df.namedNode(rdf + "rest"), df.blankNode(item.subject.value)).length == 0;
              });
              if (listHeadQuads.length != 1) {
                vue.$bvToast.toast(`The list ${listName} does not have a poc:items in it properly`);
                commit("stopExecution");
                return;
              }
              headOfList = listHeadQuads[0];
              let current = headOfList.subject.value;
              let quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
              while (quads.length > 0 && quads[0].object.value != rdf + "nil") {
                const obj = quads[0].object;
                list.push(obj);
                let rest = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "rest"), null);
                current = rest[0].object.value;
                if (current == rdf + "nil") break;
                quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
              }
            }
          } catch (error) {
            vue.$bvToast.toast(`Can't read ${source}`);
            commit("stopExecution");
            return;
          }
        }
        try {
          result = list[index].value;
        } catch (error) {
          vue.$bvToast.toast(`Index error while trying to get index ${index} from list ${source}`);
          commit("stopExecution");
          return;
        }
        //#endregion

        const valueBindingContent = constants.URIValueBinding(result);

        await dispatch("handleOutputPort", { deleteTrue: true, vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, valueBindingContent: valueBindingContent });

        //#endregion

      }
    },
    async executeInsertStep({ state, commit, dispatch }, { vue, stepName, workflowInstanceID, inputPorts, outputPorts, stepToRun }) {
      //#region Validation
      // An Insert step has 3 inputports(target, object, index) and 1 outputport(result)
      let checklist = [0, 0, 0, 0];
      if (inputPorts.length != 3) {
        vue.$bvToast.toast("The InsertStep " + stepToRun + " does not have exactly 3 input ports");
        commit("stopExecution");
        return;
      }
      inputPorts.forEach(i => {
        if (i.label == "target") {
          checklist[0] = 1;
        } else if (i.label == "object") {
          checklist[1] = 1;
        } else if (i.label == "index") {
          checklist[2] = 1;
        }
      });
      if (outputPorts.length != 1) {
        vue.$bvToast.toast("The InsertStep " + stepToRun + " does not have exactly 1 output port");
        commit("stopExecution");
        return;
      }
      outputPorts.forEach(i => {
        if (i.label == "result") {
          checklist[3] = 1;
        }
      });

      if (!checklist[0] || !checklist[1] || !checklist[2] || !checklist[3]) {
        vue.$bvToast.toast("The InsertStep " + stepToRun + " does not have ports labeled correctly");
        commit("stopExecution");
        return;
      } else { // Check complete start execution

        //#endregion
        //#region Get ports and pipes of them 

        let targetPort;
        let objectPort;
        let indexPort;

        for (const port of inputPorts) {
          if (port.label == "target") {
            targetPort = port;
          } else if (port.label == "index") {
            indexPort = port;
          } else if (port.label == "object") {
            objectPort = port;
          }
        }
        let targetPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(targetPort.uri));
        let objectPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(objectPort.uri));
        let indexPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(indexPort.uri));

        if (targetPipe.length == 0 || objectPipe.length == 0) { // Check if there are pipes that come in to the ports 
          vue.$bvToast.toast("The InsertStep " + stepToRun + " does not have pipes that targets both target and object ports");
          commit("stopExecution");
          return;
        }
        const targetPipeURI = targetPipe[0].subject.value;
        const objectPipeURI = objectPipe[0].subject.value;
        const indexPipeURI = indexPipe.length > 0 ? indexPipe[0].subject.value : "";


        let target;
        let object;
        let index;
        let datatype;

        const targetPortDataLocation = `${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetPort.name}.ttl`
        const objectPortDataLocation = `${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${objectPort.name}.ttl`
        const indexPortDataLocation = `${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${indexPort.name}.ttl`

        //#endregion
        //#region Target Port
        const isTargetPipeHumanPipe = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isTargetPipeDirectPipe = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isTargetPipeControlPipe = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isTargetPipePortPipe = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        // If target is entered by human it is stored directly in the step_instances folder 
        // If object is entered by human, if it is a complex data there is a reference value binding in the step_instances folder to a data_instance in data_instances folder
        // If the object is a xsd datatype it is stored in step instances folder

        if (isTargetPipeHumanPipe.length > 0) { // if it is human pipe the data should be in the pod of the user
          if (!(await fc.itemExists(targetPortDataLocation))) {
            commit("stopExecution");
            vue.$bvToast.toast("The inputport " + targetPort.name + " that should be entered by the human does not exists.");
            return;
          }
          const res = await fc.readFile(targetPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            target = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("In an InsertStep into inputport " + targetPort.name + ", the target entered by human cannot be literal")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("In an InsertStep into inputport " + targetPort.name + ", the datatype entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }

        } else if (isTargetPipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + targetPort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isTargetPipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            target = hasSourceURIValue[0].object.value;
          } else if (hasSourceLiteralValue.length > 0) {
            vue.$bvToast.toast("The datatype port " + targetPort.name + " has a direct pipe with a literal value which is wrong");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("The datatype port " + targetPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isTargetPipePortPipe.length > 0) {
          // There should be an inputPort entry in the step instances folder. 
          if (!(await fc.itemExists(targetPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + targetPort.name + " that should be created by automation does not exists");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(targetPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            target = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + targetPort.name + ", the target entered by automation cannot be literal")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + targetPort.name + ", the target entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + targetPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }




        //#endregion
        //#region Object Port
        const isObjectPipeHumanPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isObjectPipeDirectPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isObjectPipeControlPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isObjectPipePortPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        if (isObjectPipeHumanPipe.length > 0) {
          if (!(await fc.itemExists(objectPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the human does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(objectPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            object = literalValueQuad[0].object.value;
            datatype = literalValueQuad[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + objectPort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isObjectPipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            object = hasSourceURIValue[0].object.value;
          } else if (hasSourceLiteralValue.length > 0) {
            object = hasSourceLiteralValue[0].object.value;
            datatype = hasSourceLiteralValue[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("The object port " + objectPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipePortPipe.length > 0) {
          if (!(await fc.itemExists(objectPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the automation does not exists.");
            commit("stopExecution");
            return;
          }
          let res = await fc.readFile(objectPortDataLocation);
          let parser = new N3.Parser();
          let miniStore = new N3.Store();
          let quads = parser.parse(res);
          miniStore.addQuads(quads);
          let uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          let literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            object = literalValueQuad[0].object.value;
            datatype = literalValueQuad[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + objectPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        //#endregion
        //#region Index Port
        if (indexPipeURI != "") {
          const isIndexPipeHumanPipe = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
          const isIndexPipeDirectPipe = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
          const isIndexPipeControlPipe = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
          const isIndexPipePortPipe = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

          if (isIndexPipeHumanPipe.length > 0) {
            if (!(await fc.itemExists(indexPortDataLocation))) {
              vue.$bvToast.toast("The inputport " + indexPort.name + " that should be entered by the human does not exists.");
              commit("stopExecution");
              return;
            }
            const res = await fc.readFile(indexPortDataLocation);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
            const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
            if (uriValueQuad.length > 0) {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by human cannot be a uri")
              commit("stopExecution");
              return;
            } else if (literalValueQuad.length > 0) {
              try {
                index = parseInt(literalValueQuad[0].object.value);
              } catch (error) {
                vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by human is not a number")
                commit("stopExecution");
                return;
              }
            } else {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by human is possibly empty or malformed")
              commit("stopExecution");
              return;
            }
          } else if (isIndexPipeControlPipe.length > 0) {
            vue.$bvToast.toast("Into inputport " + indexPort.name + ", there is an control pipe which is illegal");
            commit("stopExecution");
            return;
          } else if (isIndexPipeDirectPipe.length > 0) {
            const hasSourceURIValue = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(poc + "sourceUriValue"), null);
            const hasSourceLiteralValue = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
            if (hasSourceURIValue.length > 0) {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by direct pipe cannot be a uri")
              commit("stopExecution");
              return;
            } else if (hasSourceLiteralValue.length > 0) {
              try {
                index = parseInt(hasSourceLiteralValue[0].object.value);
              } catch (error) {
                vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by human is not a number")
                commit("stopExecution");
                return;
              }
            } else {
              vue.$bvToast.toast("The index port " + indexPort.name + " has a direct pipe without a value");
              commit("stopExecution");
              return;
            }
          } else if (isIndexPipePortPipe.length > 0) {
            if (!(await fc.itemExists(indexPortDataLocation))) {
              vue.$bvToast.toast("The inputport " + indexPort.name + " that should be entered by the automation does not exists.");
              commit("stopExecution");
              return;
            }
            const res = await fc.readFile(indexPortDataLocation);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
            const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
            if (uriValueQuad.length > 0) {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by automation cannot be a uri")
              commit("stopExecution");
              return;
            } else if (literalValueQuad.length > 0) {
              try {
                index = parseInt(literalValueQuad[0].object.value);
              } catch (error) {
                vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by automation is not a number")
                commit("stopExecution");
                return;
              }
            } else {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the object entered by automation is possibly empty or malformed")
              commit("stopExecution");
              return;
            }
          } else {
            vue.$bvToast.toast("The type of pipe " + indexPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
            commit("stopExecution");
            return;
          }
        }


        //#endregion
        //#region Handle output port and result



        let listName = target.substring(target.lastIndexOf("#") + 1);
        const list = [];
        const miniStore = new N3.Store();
        if (target.startsWith(appOntology)) target = `${state.userRoot}/poc/data_instances/${listName}.ttl`;
        try {
          const res = await fc.readFile(target);
          const parser = new N3.Parser();
          let headOfList;
          const quadsParsed = parser.parse(res);
          miniStore.addQuads(quadsParsed);

          const isList = miniStore.getQuads(null, df.namedNode(rdf + "type"), df.namedNode(poc + "List"));
          if (isList.length == 0) {
            vue.$bvToast.toast("The type of target is not list in insert step");
            commit("stopExecution");
            return;
          }

          const isListEmpty = miniStore.getQuads(null, df.namedNode(poc + "items"), rdf + "nil");

          if (isListEmpty.length == 0) {
            let listHeadQuads = miniStore.getQuads(null, df.namedNode(rdf + "first"), null);

            // Filter out the ones that are rest of some node to find real head of lists
            listHeadQuads = listHeadQuads.filter(item => {
              return miniStore.getQuads(null, df.namedNode(rdf + "rest"), df.blankNode(item.subject.value)).length == 0;
            });
            if (listHeadQuads.length != 1) {
              vue.$bvToast.toast(`The list ${listName} does not have a poc:items in it properly`);
              commit("stopExecution");
              return;
            }
            headOfList = listHeadQuads[0];
            let current = headOfList.subject.value;
            let quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
            while (quads.length > 0 && quads[0].object.value != rdf + "nil") {
              const obj = quads[0].object;
              list.push(obj);
              let rest = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "rest"), null);
              current = rest[0].object.value;
              if (current == rdf + "nil") break;
              quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
            }
          }
        } catch (error) {
          vue.$bvToast.toast(`Can't read ${target}`);
          commit("stopExecution");
          return;
        }

        let node;

        if (datatype) { // literal
          node = df.literal(object, df.namedNode(datatype));
        } else {
          node = df.namedNode(object);
        }

        const writer = new N3.Writer({ prefixes: { rdf: rdf, xsd: xsd, poc: poc, dcterms: dcterms, rdfs: rdfs, owl: owl, appOntology: appOntology } });
        const typeQuads = miniStore.getQuads(null, df.namedNode(rdf + "type"), null);
        const labelQuads = miniStore.getQuads(null, df.namedNode(rdfs + "label"), null);
        const descriptionQuads = miniStore.getQuads(null, df.namedNode(dcterms + "description"), null);
        const createdQuads = miniStore.getQuads(null, df.namedNode(dcterms + "created"), null);
        const creatorQuads = miniStore.getQuads(null, df.namedNode(dcterms + "creator"), null);


        writer.addQuads(typeQuads);
        writer.addQuads(labelQuads);
        writer.addQuads(descriptionQuads);
        writer.addQuads(createdQuads);
        writer.addQuads(creatorQuads);

        if (index == undefined) index = list.length;
        list.splice(index, 0, node);
        writer.addQuad(df.namedNode(appOntology + listName), df.namedNode(poc + "items"), writer.list(list));

        writer.end(async (err, result) => {
          if (err) {
            vue.$bvToast.toast(`An error occured in writer`);
            commit("stopExecution");
            return;
          }
          await fc.createFile(target, result, "text/turtle");

          // check if there is a portpipe whose source port is this port. In this case write to the input port at the other end of the pipe 
          // check if there is a control pipe coming out of this output port. Remove the pipes accordingly. 
          let valueBindingContent = constants.URIValueBinding(target);
          await dispatch("handleOutputPort", { deleteTrue: true, vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, valueBindingContent: valueBindingContent });


        });
        //#endregion
      }
    },
    async executeModifyStep({ state, commit, dispatch }, { vue, stepName, workflowInstanceID, inputPorts, outputPorts, stepToRun }) {
      // #region Validation
      // A modify step has 4 inputports(value, object, dataField, property) and an output port(result)
      const checklist = [0, 0, 0, 0, 0];
      if (inputPorts.length !== 4) {
        vue.$bvToast.toast(
          "The ModifyStep " +
          stepToRun +
          " does not have exactly 3 input ports"
        );
        commit("stopExecution");
        return;
      }
      inputPorts.forEach(i => {
        if (i.label === "value") {
          checklist[0] = 1;
        } else if (i.label === "object") {
          checklist[1] = 1;
        } else if (i.label === "dataField") {
          checklist[2] = 1;
        } else if (i.label === "property") {
          checklist[3] = 1;
        }
      });
      if (outputPorts.length !== 1) {
        vue.$bvToast.toast(
          "The ModifyStep " +
          stepToRun +
          " does not have exactly 1 output port"
        );
        commit("stopExecution");
        return;
      }
      outputPorts.forEach(i => {
        if (i.label === "result") {
          checklist[4] = 1;
        }
      });
      if (
        !checklist[0] ||
        !checklist[1] ||
        !checklist[2] ||
        !checklist[3] ||
        !checklist[4]
      ) {
        vue.$bvToast.toast(
          "The ModifyStep " +
          stepToRun +
          " does not have ports labeled correctly"
        );
        commit("stopExecution");
        return;
      } else {
        // Check complete start execution

        // #endregion
        // #region Get ports and pipes of them

        let objectPort, propertyPort, dataFieldPort, valuePort;
        for (const inputPort of inputPorts) {
          if (inputPort.label === "object") {
            objectPort = inputPort;
          } else if (inputPort.label === "property") {
            propertyPort = inputPort;
          } else if (inputPort.label === "dataField") {
            dataFieldPort = inputPort;
          } else if (inputPort.label === "value") {
            valuePort = inputPort;
          }
        }
        const objectPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(objectPort.uri));
        const propertyPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(propertyPort.uri));
        const dataFieldPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(dataFieldPort.uri));
        const valuePipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(valuePort.uri));

        if ((propertyPipe.length === 0 && dataFieldPipe.length === 0) || objectPipe.length === 0 || valuePipe.length === 0) {
          // Check if there are pipes that come in to the ports
          vue.$bvToast.toast("The ModifyStep " + stepToRun + " does not have pipes that targets its pipes");
          commit("stopExecution");
          return;
        }
        const objectPipeURI = objectPipe[0].subject.value;
        const propertyPipeURI = propertyPipe.length > 0 ? propertyPipe[0].subject.value : "";
        const dataFieldPipeURI = dataFieldPipe.length > 0 ? dataFieldPipe[0].subject.value : "";
        const valuePipeURI = valuePipe[0].subject.value;
        const objectPortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + objectPort.name + ".ttl";
        const propertyPortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + propertyPort.name + ".ttl";
        const dataFieldPortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + dataFieldPort.name + ".ttl";
        const valuePortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + valuePort.name + ".ttl";

        let object, property, dataField, value, datatype;

        // #endregion
        // #region Object Port
        const isObjectPipeHumanPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isObjectPipeDirectPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isObjectPipeControlPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isObjectPipePortPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        if (isObjectPipeHumanPipe.length > 0) {
          if (!await fc.itemExists(objectPortDataLocation)) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the human does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(objectPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by human is not allowed to be a literal (modify)");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by human is possibly empty or malformed");
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + objectPort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isObjectPipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            object = hasSourceURIValue[0].object.value;
          } else if (hasSourceLiteralValue.length > 0) {
            vue.$bvToast.toast("The object port " + objectPort.name + " has a direct pipe with a literal value that does not match the datatype");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("The object port " + objectPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipePortPipe.length > 0) {
          if (!await fc.itemExists(objectPortDataLocation)) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the automation does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(objectPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("The value of the port " + objectPort.name + " cannot be literal in modify step");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by automation is possibly empty or malformed");
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + objectPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        // #endregion
        // #region Property Port
        if (propertyPipeURI != "") {
          const isPropertyPipeHumanPipe = state.store.getQuads(df.namedNode(propertyPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
          const isPropertyPipeDirectPipe = state.store.getQuads(df.namedNode(propertyPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
          const isPropertyPipeControlPipe = state.store.getQuads(df.namedNode(propertyPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
          const isPropertyPipePortPipe = state.store.getQuads(df.namedNode(propertyPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

          if (isPropertyPipeHumanPipe.length > 0) { // if it is human pipe the data should be in the pod of the user
            if (!(await fc.itemExists(propertyPortDataLocation))) {
              commit("stopExecution");
              vue.$bvToast.toast("The inputport " + propertyPort.name + " that should be entered by the human does not exists.");
              return;
            }
            const res = await fc.readFile(propertyPortDataLocation);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
            const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
            if (literalValueQuad.length > 0) {
              property = literalValueQuad[0].object.value;
            } else if (uriValueQuad.length > 0) {
              vue.$bvToast.toast("Into inputport " + propertyPort.name + ", the property entered by human cannot be a uri value")
              commit("stopExecution");
              return;
            } else {
              vue.$bvToast.toast("Into inputport " + propertyPort.name + ", the property entered by human is possibly empty or malformed")
              commit("stopExecution");
              return;
            }

          } else if (isPropertyPipeControlPipe.length > 0) {
            vue.$bvToast.toast("Into inputport " + propertyPort.name + ", there is an control pipe which is illegal");
            commit("stopExecution");
            return;
          } else if (isPropertyPipeDirectPipe.length > 0) {
            const hasSourceURIValue = state.store.getQuads(df.namedNode(propertyPipeURI), df.namedNode(poc + "sourceUriValue"), null);
            const hasSourceLiteralValue = state.store.getQuads(df.namedNode(propertyPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
            if (hasSourceLiteralValue.length > 0) {
              property = hasSourceLiteralValue[0].object.value;
            } else if (hasSourceURIValue.length > 0) {
              vue.$bvToast.toast("The name port " + propertyPort.name + " has a direct pipe with a uri value which is wrong");
              commit("stopExecution");
              return;
            } else {
              vue.$bvToast.toast("The name port " + propertyPort.name + " has a direct pipe without a value");
              commit("stopExecution");
              return;
            }
          } else if (isPropertyPipePortPipe.length > 0) {
            // There should be an inputPort entry in the step instances folder. 
            if (!(await fc.itemExists(propertyPortDataLocation))) {
              vue.$bvToast.toast("The inputport " + propertyPort.name + " that should be created by automation does not exists");
              commit("stopExecution");
              return;
            }
            const res = await fc.readFile(propertyPortDataLocation);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
            const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
            if (literalValueQuad.length > 0) {
              property = literalValueQuad[0].object.value;
            } else if (uriValueQuad.length > 0) {
              vue.$bvToast.toast("Into inputport " + propertyPort.name + ", the property entered by automation cannot be uri")
              commit("stopExecution");
              return;
            } else {
              vue.$bvToast.toast("Into inputport " + propertyPort.name + ", the property entered by automation is possibly empty or malformed")
              commit("stopExecution");
              return;
            }
          } else {
            vue.$bvToast.toast("The type of pipe " + propertyPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
            commit("stopExecution");
            return;
          }
        }


        //#endregion
        // #region DataField Port
        if (dataFieldPipe != "") {
          const isDataFieldPipeHumanPipe = state.store.getQuads(df.namedNode(dataFieldPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
          const isDatafieldPipeDirectPipe = state.store.getQuads(df.namedNode(dataFieldPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
          const isDataFieldPipeControlPipe = state.store.getQuads(df.namedNode(dataFieldPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
          const isDatafieldPipePortPipe = state.store.getQuads(df.namedNode(dataFieldPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

          if (isDataFieldPipeHumanPipe.length > 0) { // if it is human pipe the data should be in the pod of the user
            if (!(await fc.itemExists(dataFieldPortDataLocation))) {
              commit("stopExecution");
              vue.$bvToast.toast("The inputport " + dataFieldPort.name + " that should be entered by the human does not exists.");
              return;
            }
            const res = await fc.readFile(dataFieldPortDataLocation);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
            const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
            if (literalValueQuad.length > 0) {
              dataField = literalValueQuad[0].object.value;
            } else if (uriValueQuad.length > 0) {
              vue.$bvToast.toast("Into inputport " + dataFieldPort.name + ", the dataField entered by human cannot be a uri value")
              commit("stopExecution");
              return;
            } else {
              vue.$bvToast.toast("Into inputport " + dataFieldPort.name + ", the dataField entered by human is possibly empty or malformed")
              commit("stopExecution");
              return;
            }

          } else if (isDataFieldPipeControlPipe.length > 0) {
            vue.$bvToast.toast("Into inputport " + dataFieldPort.name + ", there is an control pipe which is illegal");
            commit("stopExecution");
            return;
          } else if (isDatafieldPipeDirectPipe.length > 0) {
            const hasSourceURIValue = state.store.getQuads(df.namedNode(dataFieldPipeURI), df.namedNode(poc + "sourceUriValue"), null);
            const hasSourceLiteralValue = state.store.getQuads(df.namedNode(dataFieldPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
            if (hasSourceLiteralValue.length > 0) {
              dataField = hasSourceLiteralValue[0].object.value;
            } else if (hasSourceURIValue.length > 0) {
              vue.$bvToast.toast("The name port " + dataFieldPort.name + " has a direct pipe with a uri value which is wrong");
              commit("stopExecution");
              return;
            } else {
              vue.$bvToast.toast("The name port " + dataFieldPort.name + " has a direct pipe without a value");
              commit("stopExecution");
              return;
            }
          } else if (isDatafieldPipePortPipe.length > 0) {
            // There should be an inputPort entry in the step instances folder. 
            if (!(await fc.itemExists(dataFieldPortDataLocation))) {
              vue.$bvToast.toast("The inputport " + dataFieldPort.name + " that should be created by automation does not exists");
              commit("stopExecution");
              return;
            }
            const res = await fc.readFile(dataFieldPortDataLocation);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
            const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
            if (literalValueQuad.length > 0) {
              dataField = literalValueQuad[0].object.value;
            } else if (uriValueQuad.length > 0) {
              vue.$bvToast.toast("Into inputport " + dataFieldPort.name + ", the dataField entered by automation cannot be uri")
              commit("stopExecution");
              return;
            } else {
              vue.$bvToast.toast("Into inputport " + dataFieldPort.name + ", the dataField entered by automation is possibly empty or malformed")
              commit("stopExecution");
              return;
            }
          } else {
            vue.$bvToast.toast("The type of pipe " + dataFieldPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
            commit("stopExecution");
            return;
          }
        }

        //#endregion
        // #region Value port
        const isValuePipeHumanPipe = state.store.getQuads(df.namedNode(valuePipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isValuePipeDirectPipe = state.store.getQuads(df.namedNode(valuePipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isValuePipeControlPipe = state.store.getQuads(df.namedNode(valuePipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isValuePipePortPipe = state.store.getQuads(df.namedNode(valuePipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        if (isValuePipeHumanPipe.length > 0) {
          if (!await fc.itemExists(valuePortDataLocation)) {
            vue.$bvToast.toast("The inputport " + valuePort.name + " that should be entered by the human does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(valuePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            value = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            value = literalValueQuad[0].object.value;
            datatype = literalValueQuad[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("Into inputport " + valuePort.name + ", the value entered by human is possibly empty or malformed");
            commit("stopExecution");
            return;
          }
        } else if (isValuePipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + valuePort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isValuePipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(valuePipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(valuePipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            value = hasSourceURIValue[0].object.value;
          } else if (hasSourceLiteralValue.length > 0) {
            value = hasSourceLiteralValue[0].object.value;
            datatype = hasSourceLiteralValue[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("The object port " + valuePort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isValuePipePortPipe.length > 0) {
          if (!await fc.itemExists(valuePortDataLocation)) {
            vue.$bvToast.toast("The inputport " + valuePort.name + " that should be entered by the automation does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(valuePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            value = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            value = literalValueQuad[0].object.value;
            datatype = literalValueQuad[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("Into inputport " + valuePort.name + ", the value entered by automation is possibly empty or malformed");
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + valuePipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        // #endregion
        // #region Handle output
        const outputPort = outputPorts[0];

        if ((dataField == undefined && property == undefined) || (dataField != undefined && property != undefined)) {
          vue.$bvToast.toast("The modify step must have only one of datafield and property ports.")
          commit("stopExecution");
          return;
        }

        let valueBindingContent;

        if (dataField != undefined) { // dataField given
          const res = await fc.readFile(object);
          const parser = new N3.Parser();
          const ministore = new N3.Store();
          const quads = parser.parse(res);
          ministore.addQuads(quads);

          const isCompositeDatatype = ministore.getQuads(null, df.namedNode(rdf + "type"), df.namedNode(poc + "CompositeDataInstance"));
          if (isCompositeDatatype.length == 0) {
            vue.$bvToast.toast("The modify step's object port should have a composite data instance")
            commit("stopExecution");
            return;
          }

          const fieldValueQuads = ministore.getQuads(null, df.namedNode(poc + "fieldValue"), null);
          const datatypeQuad = ministore.getQuads(null, df.namedNode(poc + "datatype"), null);
          const inputsNeeded = [];

          if (datatypeQuad.length == 0) {
            vue.$bvToast.toast("The datatype of the composite data instance does not exist " + object);
            commit("stopExecution");
            return;
          }

          for (const quad of fieldValueQuads) {
            const uriValue = ministore.getQuads(quad.object, df.namedNode(poc + "uriValue"), null);
            const literalValue = ministore.getQuads(quad.object, df.namedNode(poc + "literalValue"), null);
            const label = ministore.getQuads(quad.object, df.namedNode(rdfs + "label"), null);
            let input = {};
            if (label.length == 0) {
              vue.$bvToast.toast("The field does not have a label " + quad.object.value);
              commit("stopExecution");
              return;
            }

            if (uriValue.length > 0) {
              input.type = "uri";
              input.label = label[0].object.value;
              input.value = (dataField == label[0].object.value) ? value : uriValue[0].object.value;
            } else if (literalValue.length > 0) {
              input.type = "literal";
              input.label = label[0].object.value;
              input.value = (dataField == label[0].object.value) ? value : literalValue[0].object.value;
              input.typeName = (dataField == label[0].object.value) ? datatype.substring(datatype.lastIndexOf("#") + 1) : literalValue[0].object.datatype.value.substring(literalValue[0].object.datatype.value.lastIndexOf("#") + 1);
            } else {
              vue.$bvToast.toast("The field value is not literal or uri " + label[0].object.value);
              commit("stopExecution");
              return;
            }
            inputsNeeded.push(input);
          }


          const result = constants.compositeDataInstance(inputsNeeded, datatypeQuad[0].object.value);

          await fc.createFile(object, result, "text/turtle");
        } else { // property given do not support this
          vue.$bvToast.toast("The modify step execution engine does not support property in this version.")
          commit("stopExecution");
          return;
        }

        valueBindingContent = constants.URIValueBinding(object);


        await dispatch("handleOutputPort", { deleteTrue: true, vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, valueBindingContent: valueBindingContent });
        // #endregion

      }
    },
    async executeRemoveStep({ state, commit, dispatch }, { vue, stepName, workflowInstanceID, inputPorts, outputPorts, stepToRun }) {
      //#region Validation
      // A Remove step has 3 inputports(target, index, object) and an output port(result)
      const checklist = [0, 0, 0, 0];
      if (inputPorts.length != 3) {
        vue.$bvToast.toast("The RemoveStep " + stepToRun + " does not have exactly 3 input ports");
        commit("stopExecution");
        return;
      }
      inputPorts.forEach(i => {
        if (i.label == "target") {
          checklist[0] = 1;
        } else if (i.label == "index") {
          checklist[1] = 1;
        } else if (i.label == "object") {
          checklist[2] = 1;
        }
      });

      if (outputPorts.length != 1) {
        vue.$bvToast.toast("The RemoveStep " + stepToRun + " does not have exactly 1 output port");
        commit("stopExecution");
        return;
      }
      if (outputPorts[0].label == "result") checklist[3] = 1;
      if (!checklist[0] || !checklist[1] || !checklist[2] || !checklist[3]) {
        vue.$bvToast.toast("The RemoveStep " + stepToRun + " does not have ports labeled correctly");
        commit("stopExecution");
        return;
      } else { // Check complete start execution
        //#endregion
        //#region Get ports and pipes of them 

        let targetPort;
        let objectPort;
        let indexPort;

        for (const port of inputPorts) {
          if (port.label == "target") {
            targetPort = port;
          } else if (port.label == "index") {
            indexPort = port;
          } else if (port.label == "object") {
            objectPort = port;
          }
        }
        let targetPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(targetPort.uri));
        let objectPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(objectPort.uri));
        let indexPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(indexPort.uri));

        if (targetPipe.length == 0 || objectPipe.length == 0) { // Check if there are pipes that come in to the ports 
          vue.$bvToast.toast("The RemoveStep " + stepToRun + " does not have pipes that targets both target and object ports");
          commit("stopExecution");
          return;
        }
        const targetPipeURI = targetPipe[0].subject.value;
        const objectPipeURI = objectPipe[0].subject.value;
        const indexPipeURI = indexPipe.length > 0 ? indexPipe[0].subject.value : "";


        let target;
        let object;
        let index;
        let datatype;

        const targetPortDataLocation = `${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetPort.name}.ttl`
        const objectPortDataLocation = `${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${objectPort.name}.ttl`
        const indexPortDataLocation = `${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${indexPort.name}.ttl`

        //#endregion
        //#region Target Port
        const isTargetPipeHumanPipe = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isTargetPipeDirectPipe = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isTargetPipeControlPipe = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isTargetPipePortPipe = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        // If target is entered by human it is stored directly in the step_instances folder 
        // If object is entered by human, if it is a complex data there is a reference value binding in the step_instances folder to a data_instance in data_instances folder
        // If the object is a xsd datatype it is stored in step instances folder

        if (isTargetPipeHumanPipe.length > 0) { // if it is human pipe the data should be in the pod of the user
          if (!(await fc.itemExists(targetPortDataLocation))) {
            commit("stopExecution");
            vue.$bvToast.toast("The inputport " + targetPort.name + " that should be entered by the human does not exists.");
            return;
          }
          const res = await fc.readFile(targetPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            target = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("In an RemoveStep into inputport " + targetPort.name + ", the target entered by human cannot be literal")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("In an RemoveStep into inputport " + targetPort.name + ", the datatype entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }

        } else if (isTargetPipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + targetPort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isTargetPipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(targetPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            target = hasSourceURIValue[0].object.value;
          } else if (hasSourceLiteralValue.length > 0) {
            vue.$bvToast.toast("The datatype port " + targetPort.name + " has a direct pipe with a literal value which is wrong");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("The datatype port " + targetPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isTargetPipePortPipe.length > 0) {
          // There should be an inputPort entry in the step instances folder. 
          if (!(await fc.itemExists(targetPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + targetPort.name + " that should be created by automation does not exists");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(targetPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            target = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + targetPort.name + ", the target entered by automation cannot be literal")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + targetPort.name + ", the target entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + targetPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }




        //#endregion
        //#region Object Port
        const isObjectPipeHumanPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isObjectPipeDirectPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isObjectPipeControlPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isObjectPipePortPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        if (isObjectPipeHumanPipe.length > 0) {
          if (!(await fc.itemExists(objectPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the human does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(objectPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            object = literalValueQuad[0].object.value;
            datatype = literalValueQuad[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + objectPort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isObjectPipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            object = hasSourceURIValue[0].object.value;
          } else if (hasSourceLiteralValue.length > 0) {
            object = hasSourceLiteralValue[0].object.value;
            datatype = hasSourceLiteralValue[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("The object port " + objectPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipePortPipe.length > 0) {
          if (!(await fc.itemExists(objectPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the automation does not exists.");
            commit("stopExecution");
            return;
          }
          let res = await fc.readFile(objectPortDataLocation);
          let parser = new N3.Parser();
          let miniStore = new N3.Store();
          let quads = parser.parse(res);
          miniStore.addQuads(quads);
          let uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          let literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            object = literalValueQuad[0].object.value;
            datatype = literalValueQuad[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + objectPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        //#endregion
        //#region Index Port
        if (indexPipeURI != "") {
          const isIndexPipeHumanPipe = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
          const isIndexPipeDirectPipe = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
          const isIndexPipeControlPipe = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
          const isIndexPipePortPipe = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

          if (isIndexPipeHumanPipe.length > 0) {
            if (!(await fc.itemExists(indexPortDataLocation))) {
              vue.$bvToast.toast("The inputport " + indexPort.name + " that should be entered by the human does not exists.");
              commit("stopExecution");
              return;
            }
            const res = await fc.readFile(indexPortDataLocation);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
            const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
            if (uriValueQuad.length > 0) {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by human cannot be a uri")
              commit("stopExecution");
              return;
            } else if (literalValueQuad.length > 0) {
              try {
                index = parseInt(literalValueQuad[0].object.value);
              } catch (error) {
                vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by human is not a number")
                commit("stopExecution");
                return;
              }
            } else {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by human is possibly empty or malformed")
              commit("stopExecution");
              return;
            }
          } else if (isIndexPipeControlPipe.length > 0) {
            vue.$bvToast.toast("Into inputport " + indexPort.name + ", there is an control pipe which is illegal");
            commit("stopExecution");
            return;
          } else if (isIndexPipeDirectPipe.length > 0) {
            const hasSourceURIValue = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(poc + "sourceUriValue"), null);
            const hasSourceLiteralValue = state.store.getQuads(df.namedNode(indexPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
            if (hasSourceURIValue.length > 0) {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by direct pipe cannot be a uri")
              commit("stopExecution");
              return;
            } else if (hasSourceLiteralValue.length > 0) {
              try {
                index = parseInt(hasSourceLiteralValue[0].object.value);
              } catch (error) {
                vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by human is not a number")
                commit("stopExecution");
                return;
              }
            } else {
              vue.$bvToast.toast("The index port " + indexPort.name + " has a direct pipe without a value");
              commit("stopExecution");
              return;
            }
          } else if (isIndexPipePortPipe.length > 0) {
            if (!(await fc.itemExists(indexPortDataLocation))) {
              vue.$bvToast.toast("The inputport " + indexPort.name + " that should be entered by the automation does not exists.");
              commit("stopExecution");
              return;
            }
            const res = await fc.readFile(indexPortDataLocation);
            const parser = new N3.Parser();
            const miniStore = new N3.Store();
            const quads = parser.parse(res);
            miniStore.addQuads(quads);
            const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
            const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
            if (uriValueQuad.length > 0) {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by automation cannot be a uri")
              commit("stopExecution");
              return;
            } else if (literalValueQuad.length > 0) {
              try {
                index = parseInt(literalValueQuad[0].object.value);
              } catch (error) {
                vue.$bvToast.toast("Into inputport " + indexPort.name + ", the index entered by automation is not a number")
                commit("stopExecution");
                return;
              }
            } else {
              vue.$bvToast.toast("Into inputport " + indexPort.name + ", the object entered by automation is possibly empty or malformed")
              commit("stopExecution");
              return;
            }
          } else {
            vue.$bvToast.toast("The type of pipe " + indexPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
            commit("stopExecution");
            return;
          }
        }


        //#endregion
        //#region Handle output port and result

        // Check only one of object or index is given
        if ((index != undefined && object != undefined) || (index == undefined && object == undefined)) {
          vue.$bvToast.toast(`Please give only one of index and object to the remove step `);
          commit("stopExecution");
          return;
        }
        let url = new URL(object);
        let userRoot = `${url.protocol}//${url.hostname}`;
        let listName = target.substring(target.lastIndexOf("#") + 1);
        let list = [];
        if (target.startsWith(appOntology)) target = `${userRoot}/poc/data_instances/${listName}.ttl`;
        const miniStore = new N3.Store();
        try {
          const res = await fc.readFile(target);
          const parser = new N3.Parser();
          let headOfList;
          const quadsParsed = parser.parse(res);
          miniStore.addQuads(quadsParsed);

          const isList = miniStore.getQuads(null, df.namedNode(rdf + "type"), df.namedNode(poc + "List"));
          if (isList.length == 0) {
            vue.$bvToast.toast("The type of target is not list in remove step");
            commit("stopExecution");
            return;
          }

          const isListEmpty = miniStore.getQuads(null, df.namedNode(poc + "items"), rdf + "nil");

          if (isListEmpty.length == 0) {
            let listHeadQuads = miniStore.getQuads(null, df.namedNode(rdf + "first"), null);

            // Filter out the ones that are rest of some node to find real head of lists
            listHeadQuads = listHeadQuads.filter(item => {
              return miniStore.getQuads(null, df.namedNode(rdf + "rest"), df.blankNode(item.subject.value)).length == 0;
            });
            if (listHeadQuads.length != 1) {
              vue.$bvToast.toast(`The list ${listName} does not have a poc:items in it properly`);
              commit("stopExecution");
              return;
            }
            headOfList = listHeadQuads[0];
            let current = headOfList.subject.value;
            let quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
            while (quads.length > 0 && quads[0].object.value != rdf + "nil") {
              const obj = quads[0].object;
              list.push(obj);
              let rest = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "rest"), null);
              current = rest[0].object.value;
              if (current == rdf + "nil") break;
              quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
            }
          }
        } catch (error) {
          vue.$bvToast.toast(`Can't read ${target}`);
          commit("stopExecution");
          return;
        }

        let node;

        if (datatype) { // literal
          node = df.literal(object, df.namedNode(datatype));
        } else {
          node = df.namedNode(object);
        }

        const writer = new N3.Writer({ prefixes: { rdf: rdf, xsd: xsd, poc: poc, dcterms: dcterms, rdfs: rdfs, owl: owl, appOntology: appOntology } });
        const typeQuads = miniStore.getQuads(null, df.namedNode(rdf + "type"), null);
        const labelQuads = miniStore.getQuads(null, df.namedNode(rdfs + "label"), null);
        const descriptionQuads = miniStore.getQuads(null, df.namedNode(dcterms + "description"), null);
        const createdQuads = miniStore.getQuads(null, df.namedNode(dcterms + "created"), null);
        const creatorQuads = miniStore.getQuads(null, df.namedNode(dcterms + "creator"), null);


        writer.addQuads(typeQuads);
        writer.addQuads(labelQuads);
        writer.addQuads(descriptionQuads);
        writer.addQuads(createdQuads);
        writer.addQuads(creatorQuads);

        if (index != undefined) { // index removal
          list.splice(index, 1);
        } else { // object removal
          list = list.filter(l => {
            return l.value != node.value;
          });
        }

        writer.addQuad(df.namedNode(appOntology + listName), df.namedNode(poc + "items"), writer.list(list));

        writer.end(async (err, result) => {
          if (err) {
            vue.$bvToast.toast(`An error occured in writer`);
            commit("stopExecution");
            return;
          }
          await fc.createFile(`${target}`, result, "text/turtle");

          // check if there is a portpipe whose source port is this port. In this case write to the input port at the other end of the pipe 
          // check if there is a control pipe coming out of this output port. Remove the pipes accordingly. 
          let valueBindingContent = constants.URIValueBinding(target);
          await dispatch("handleOutputPort", { deleteTrue: true, vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, valueBindingContent: valueBindingContent });
        });
        //#endregion
      }
    },
    async executeSaveStep({ state, commit, dispatch }, { vue, stepName, workflowInstanceID, inputPorts, outputPorts, stepToRun }) {
      //#region Validation
      // A Save step has 2 inputports(name, object)
      const checklist = [0, 0];
      if (inputPorts.length != 2) {
        vue.$bvToast.toast("The SaveStep " + stepToRun + " does not have exactly 2 input ports");
        commit("stopExecution");
        return;
      }
      inputPorts.forEach(i => {
        if (i.label == "name") {
          checklist[0] = 1;
        } else if (i.label == "object") {
          checklist[1] = 1;
        }
      });
      if (outputPorts.length != 0) {
        vue.$bvToast.toast("The SaveStep " + stepToRun + " does not have exactly 0 output port");
        commit("stopExecution");
        return;
      }

      if (!checklist[0] || !checklist[1]) {
        vue.$bvToast.toast("The SaveStep " + stepToRun + " does not have ports labeled correctly");
        commit("stopExecution");
        return;
      } else { // Check complete start execution
        //#endregion
        //#region Get ports and pipes of them 
        const namePort = inputPorts[0].label == "name" ? inputPorts[0] : inputPorts[1];
        const objectPort = inputPorts[0].label == "object" ? inputPorts[0] : inputPorts[1];
        const namePipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(namePort.uri));
        const objectPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(objectPort.uri));


        if (namePipe.length == 0 || objectPipe.length == 0) { // Check if there are pipes that come in to the ports 
          vue.$bvToast.toast("The SaveStep " + stepToRun + " does not have pipes that targets both name and object ports");
          commit("stopExecution");
          return;
        }
        const namePortPipeURI = namePipe[0].subject.value;
        const objectPortPipeURI = objectPipe[0].subject.value;
        const namePortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + namePort.name + ".ttl";
        const objectPortDataLocation = state.userRoot + "/poc/workflow_instances/" + workflowInstanceID + "_step_instances/" + objectPort.name + ".ttl";

        let object;
        let datatype;
        let name;
        //#endregion
        //#region Object Port
        const isObjectPipeHumanPipe = state.store.getQuads(df.namedNode(objectPortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isObjectPipeDirectPipe = state.store.getQuads(df.namedNode(objectPortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isObjectPipeControlPipe = state.store.getQuads(df.namedNode(objectPortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isObjectPipePortPipe = state.store.getQuads(df.namedNode(objectPortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));


        if (isObjectPipeHumanPipe.length > 0) {
          if (!(await fc.itemExists(objectPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the human does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(objectPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            object = literalValueQuad[0].object.value;
            datatype = literalValueQuad[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + objectPort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isObjectPipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(objectPortPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(objectPortPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            object = hasSourceURIValue[0].object.value;
          } else if (hasSourceLiteralValue.length > 0) {
            object = hasSourceLiteralValue[0].object.value;
            datatype = hasSourceLiteralValue[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("The object port " + objectPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipePortPipe.length > 0) {
          if (!(await fc.itemExists(objectPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the automation does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(objectPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            object = literalValueQuad[0].object.value;
            datatype = literalValueQuad[0].object.datatype.value;
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + objectPortPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        //#endregion
        //#region Name Port
        const isNamePipeHumanPipe = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isNamePipeDirectPipe = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isNamePipeControlPipe = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isNamePipePortPipe = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        if (isNamePipeHumanPipe.length > 0) { // if it is human pipe the data should be in the pod of the user
          if (!(await fc.itemExists(namePortDataLocation))) {
            commit("stopExecution");
            vue.$bvToast.toast("The inputport " + namePort.name + " that should be entered by the human does not exists.");
            return;
          }
          const res = await fc.readFile(namePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (literalValueQuad.length > 0) {
            name = literalValueQuad[0].object.value;
          } else if (uriValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + namePort.name + ", the name entered by human cannot be a uri value")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + namePort.name + ", the name entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }

        } else if (isNamePipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + namePort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isNamePipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(namePortPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceLiteralValue.length > 0) {
            name = hasSourceLiteralValue[0].object.value;
          } else if (hasSourceURIValue.length > 0) {
            vue.$bvToast.toast("The name port " + namePort.name + " has a direct pipe with a uri value which is wrong");
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("The name port " + namePort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isNamePipePortPipe.length > 0) {
          // There should be an inputPort entry in the step instances folder. 
          if (!(await fc.itemExists(namePortDataLocation))) {
            vue.$bvToast.toast("The inputport " + namePort.name + " that should be created by automation does not exists");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(namePortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (literalValueQuad.length > 0) {
            name = literalValueQuad[0].object.value;
          } else if (uriValueQuad.length > 0) {
            vue.$bvToast.toast("Into inputport " + namePort.name + ", the name entered by automation cannot be uri")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + namePort.name + ", the name entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + namePortPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        //#endregion
        //#region Handle result

        let valueBindingContent;
        if (datatype) {
          const datatypeName = datatype.substring(datatype.lastIndexOf("#") + 1);
          valueBindingContent = constants.literalValueBinding(object, datatypeName);
        } else {
          valueBindingContent = constants.URIValueBinding(object);
        }

        await dispatch("handleOutputPortSimple", { stepName: stepName, vue: vue, workflowInstanceID: workflowInstanceID });

        await fc.postFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${name}.ttl`, valueBindingContent, "text/turtle");


        //#endregion
      }
    },
    async executeSizeStep({ state, commit, dispatch }, { vue, stepName, workflowInstanceID, inputPorts, outputPorts, stepToRun }) {
      //#region Validation
      // A Size step has 1 inputport (object) and an output port(result)
      const checklist = [0, 0];
      if (inputPorts.length != 1) {
        vue.$bvToast.toast("The SizeStep " + stepToRun + " does not have exactly 1 input ports");
        commit("stopExecution");
        return;
      }
      inputPorts.forEach(i => {
        if (i.label == "object") {
          checklist[0] = 1;
        }
      });
      if (outputPorts.length != 1) {
        vue.$bvToast.toast("The SizeStep " + stepToRun + " does not have exactly 1 output port");
        commit("stopExecution");
        return;
      }
      outputPorts.forEach(i => {
        if (i.label == "result") {
          checklist[1] = 1;
        }
      });



      if (!checklist[0] || !checklist[1]) {
        vue.$bvToast.toast("The SizeStep " + stepToRun + " does not have ports labeled correctly");
        commit("stopExecution");
        return;
      } else { // Check complete start execution
        //#endregion
        //#region Get ports and pipes of them 

        let objectPort = inputPorts[0];


        let objectPipe = state.store.getQuads(null, df.namedNode(poc + "targetPort"), df.namedNode(objectPort.uri));

        if (objectPipe.length == 0) { // Check if there are pipes that come in to the ports 
          vue.$bvToast.toast("The SizeStep " + stepToRun + " does not have a pipe that targets object port");
          commit("stopExecution");
          return;
        }
        const objectPipeURI = objectPipe[0].subject.value;


        let object;


        const objectPortDataLocation = `${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${objectPort.name}.ttl`


        //#endregion
        //#region Object Port
        const isObjectPipeHumanPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "HumanPipe"));
        const isObjectPipeDirectPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "DirectPipe"));
        const isObjectPipeControlPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));
        const isObjectPipePortPipe = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));

        if (isObjectPipeHumanPipe.length > 0) {
          if (!(await fc.itemExists(objectPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the human does not exists.");
            commit("stopExecution");
            return;
          }
          const res = await fc.readFile(objectPortDataLocation);
          const parser = new N3.Parser();
          const miniStore = new N3.Store();
          const quads = parser.parse(res);
          miniStore.addQuads(quads);
          const uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          const literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("The size step does not support literal value.")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by human is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipeControlPipe.length > 0) {
          vue.$bvToast.toast("Into inputport " + objectPort.name + ", there is an control pipe which is illegal");
          commit("stopExecution");
          return;
        } else if (isObjectPipeDirectPipe.length > 0) {
          const hasSourceURIValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceUriValue"), null);
          const hasSourceLiteralValue = state.store.getQuads(df.namedNode(objectPipeURI), df.namedNode(poc + "sourceLiteralValue"), null);
          if (hasSourceURIValue.length > 0) {
            object = hasSourceURIValue[0].object.value;
          } else if (hasSourceLiteralValue.length > 0) {
            vue.$bvToast.toast("The size step does not support literal value.")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("The object port " + objectPort.name + " has a direct pipe without a value");
            commit("stopExecution");
            return;
          }
        } else if (isObjectPipePortPipe.length > 0) {
          if (!(await fc.itemExists(objectPortDataLocation))) {
            vue.$bvToast.toast("The inputport " + objectPort.name + " that should be entered by the automation does not exists.");
            commit("stopExecution");
            return;
          }
          let res = await fc.readFile(objectPortDataLocation);
          let parser = new N3.Parser();
          let miniStore = new N3.Store();
          let quads = parser.parse(res);
          miniStore.addQuads(quads);
          let uriValueQuad = miniStore.getQuads(null, df.namedNode(poc + "uriValue"), null);
          let literalValueQuad = miniStore.getQuads(null, df.namedNode(poc + "literalValue"), null);
          if (uriValueQuad.length > 0) {
            object = uriValueQuad[0].object.value;
          } else if (literalValueQuad.length > 0) {
            vue.$bvToast.toast("The size step does not support literal value.")
            commit("stopExecution");
            return;
          } else {
            vue.$bvToast.toast("Into inputport " + objectPort.name + ", the object entered by automation is possibly empty or malformed")
            commit("stopExecution");
            return;
          }
        } else {
          vue.$bvToast.toast("The type of pipe " + objectPipeURI + " is not humanpipe, control pipe, direct pipe or port pipe");
          commit("stopExecution");
          return;
        }
        //#endregion
        //#region Handle output port and result

        let list = [];
        const miniStore = new N3.Store();
        let listName = object.substring(object.lastIndexOf("#") + 1);
        if (object.startsWith(appOntology)) {
          await dispatch("fetchAllLists");
          for (const l of state.lists) {
            if (l.listName.substring(l.listName.lastIndexOf("#") + 1) == listName) {
              list = l.list;
            }
          }
        } else {

          try {
            const res = await fc.readFile(object);
            const parser = new N3.Parser();
            let headOfList;
            const quadsParsed = parser.parse(res);
            miniStore.addQuads(quadsParsed);
            const isList = miniStore.getQuads(null, df.namedNode(rdf + "type"), df.namedNode(poc + "List"));

            if (isList.length == 0) {
              vue.$bvToast.toast("Error sizestep's object port has a uri value that is not a list");
              commit("stopExecution");
              return;
            }
            const isListEmpty = miniStore.getQuads(null, df.namedNode(poc + "items"), rdf + "nil");

            if (isListEmpty.length == 0) {
              let listHeadQuads = miniStore.getQuads(null, df.namedNode(rdf + "first"), null);

              // Filter out the ones that are rest of some node to find real head of lists
              listHeadQuads = listHeadQuads.filter(item => {
                return miniStore.getQuads(null, df.namedNode(rdf + "rest"), df.blankNode(item.subject.value)).length == 0;
              });
              if (listHeadQuads.length != 1) {
                vue.$bvToast.toast(`The list ${listName} does not have a poc:items in it properly`);
                commit("stopExecution");
                return;
              }
              headOfList = listHeadQuads[0];
              let current = headOfList.subject.value;
              let quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
              while (quads.length > 0 && quads[0].object.value != rdf + "nil") {
                const obj = quads[0].object;
                list.push(obj);
                let rest = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "rest"), null);
                current = rest[0].object.value;
                if (current == rdf + "nil") break;
                quads = miniStore.getQuads(df.blankNode(current), df.namedNode(rdf + "first"), null);
              }
            }
          } catch (error) {
            vue.$bvToast.toast(`Can't read ${object}`);
            commit("stopExecution");
            return;
          }
        }

        const size = list.length;

        // check if there is a portpipe whose source port is this port. In this case write to the input port at the other end of the pipe 
        // check if there is a control pipe coming out of this output port. Remove the pipes accordingly. 
        let valueBindingContent = constants.literalValueBinding(size, "integer");
        await dispatch("handleOutputPort", { deleteTrue: size != 0, vue: vue, workflowInstanceID: workflowInstanceID, stepName: stepName, valueBindingContent: valueBindingContent });

        //#endregion
      }
    },
    async completeAllAfter({ state }, { stepName, workflowInstanceID, vue }) {
      const pipesOriginateFromStep = state.store.getQuads(null, df.namedNode(poc + "sourceStep"), df.namedNode(appOntology + stepName));
      pipesOriginateFromStep.forEach(async x => {
        const pipeName = x.subject.value.substring(x.subject.value.lastIndexOf("#") + 1);
        const targetStep = state.store.getQuads(df.namedNode(appOntology + pipeName), df.namedNode(poc + "targetStep"), null);
        const targetStepName = targetStep[0].object.value.substring(targetStep[0].object.value.lastIndexOf("#") + 1);

        const isPortPipe = state.store.getQuads(df.namedNode(x.subject.value), df.namedNode(rdf + "type"), df.namedNode(poc + "PortPipe"));
        const isControlPipe = state.store.getQuads(df.namedNode(x.subject.value), df.namedNode(rdf + "type"), df.namedNode(poc + "ControlPipe"));

        if (isPortPipe.length > 0 || isControlPipe.length > 0) {
          const res = await fc.readFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetStepName}.ttl`);
          const parser = new N3.Parser();
          const writer = new N3.Writer({
            prefixes: {
              poc: poc,
              dcterms: dcterms,
              rdf: rdf,
              xsd: xsd,
              rdfs: rdfs,
              owl: owl,
              appOntology: appOntology
            },
          });
          const quads = parser.parse(res);
          let isCompleteAlready;
          quads.forEach(q => {
            if (q.predicate.value == poc + "status") {
              isCompleteAlready = q.object.value == "completed";
              writer.addQuad(q.subject, q.predicate, df.literal("completed", df.namedNode(xsd + "string")));
            } else {
              writer.addQuad(q);
            }
          });
          writer.end(async (err, res) => {
            await fc.createFile(`${state.userRoot}/poc/workflow_instances/${workflowInstanceID}_step_instances/${targetStepName}.ttl`, res, "text/turtle");
          });
          if (!isCompleteAlready) vue.$bvToast.toast("The step " + targetStepName + " has been completed.");

        }

      })
    }
  },
});
