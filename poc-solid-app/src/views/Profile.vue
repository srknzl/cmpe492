<template>
  <div class="profile">
    <b-card style="marginTop: 1rem;" class="poccontainer">
      <b-card-header header-tag="header" role="tab">
        <b-button
          block
          v-b-toggle.accordion-8
          class="d-flex justify-content-start"
          variant="primary"
        >
          <h3>Your tasks</h3>
        </b-button>
      </b-card-header>
      <b-collapse id="accordion-8">
        <p v-if="workflowInstances.length == 0">No tasks</p>
        <b-card
          v-for="(w,ind) in workflowInstances"
          :key="ind"
          class="poccontainer"
          :style="!w.needInput ? '' : 'backgroundColor: lightgreen;'"
        >
          <p>
            <b></b>
            {{ind+1}}:
            <a :href="w.url" target="_blank">{{simplifyURL(w.url)}}</a>
          </p>
          <p>
            <b>Last modification</b>
            {{new Date(w.modified).toLocaleString("tr")}}
          </p>
          <p>
            <b>Type</b>
            {{simplify(w.datatype)}}
          </p>
          <b-button
            variant="success"
            @click="workflowInstanceStatus(w.url, w.datatype)"
          >Enter input</b-button>
        </b-card>
      </b-collapse>
    </b-card>
    <b-card style="marginTop: 1rem;" class="poccontainer">
      <b-card-header header-tag="header" role="tab">
        <b-button
          block
          v-b-toggle.accordion-2
          class="d-flex justify-content-start"
          variant="primary"
        >
          <h3>Your contribution</h3>
        </b-button>
      </b-card-header>
      <b-collapse id="accordion-2">
        <p v-if="lists.length == 0">No content contribution</p>
        <b-card v-for="(l,ind) in lists" :key="ind" class="poccontainer">
          <p>
            <b>{{ind+1}}:</b>
            <a :href="l.listName" target="_blank">{{simplify(l.listName)}}</a>
          </p>
          <p v-if="l.list.length == 0">No items</p>
          <p v-if="l.list.length > 0">
            <b>Items:</b>
          </p>
          <ul v-if="l.list.length > 0">
            <li v-for="(item, indice) in l.list" :key="indice">
              <p v-if="item.termType == 'Literal'">
                <u>Value:</u>
                <br />
                <b>Datatype:</b>
                {{simplify(item.datatype.value)}}
                <br />
                <b>Value:</b>
                {{item.value}}
                <br />
              </p>
              <p v-if="item.termType == 'NamedNode'">
                <b>Value:</b>
                <a :href="item.value" target="_blank">{{simplifyURL(item.value)}}</a>
                <br />
              </p>
            </li>
          </ul>
        </b-card>
      </b-collapse>
    </b-card>
    <b-card style="marginTop: 1rem;" class="poccontainer">
      <b-card-header header-tag="header" role="tab">
        <b-button
          block
          v-b-toggle.accordion-6
          class="d-flex justify-content-start"
          variant="primary"
        >
          <h3>Your content</h3>
        </b-button>
      </b-card-header>
      <b-collapse id="accordion-6">
        <p v-if="dataInstances.length == 0">No content</p>
        <b-card v-for="(d,ind) in dataInstances" :key="ind" class="poccontainer">
          <p>
            <b>{{ind+1}}:</b>

            <a :href="d.uri" target="_blank">{{simplifyURL(d.uri)}}</a>
          </p>
          <p v-if="d.datatype">
            <b>Datatype</b>
            {{simplify(d.datatype)}}
          </p>

          <b-card v-for="(fieldValue,ind) in d.fieldValues" :key="ind">
            <p v-if="fieldValue.value.startsWith('http')">
              <b>{{fieldValue.label}}:</b>
              <a
                :href="fieldValue.value"
                target="_blank"
              >{{fieldValue.value.substring(fieldValue.value.lastIndexOf("/")+1)}}</a>
            </p>
            <p v-else>
              <b>{{fieldValue.label}}:</b>
              {{fieldValue.value}}
            </p>
          </b-card>
        </b-card>
      </b-collapse>
    </b-card>
    <!-- <p>
      Note: In order these buttons below to work, you need to grant all the
      permissions including "Control" in your preferences to this
      application url.
    </p>
    <div class="d-flex justify-content-center">
      <b-button
        style="margin: 0.2rem;"
        variant="primary"
        @click="onDeleteUserInfo"
      >Delete my all data in my pod</b-button>
      <br />
      <b-button
        style="margin: 0.2rem;"
        variant="primary"
        @click="onDeleteUserWorkflowInstances"
      >Delete my all workflow instances in my pod</b-button>
      <br />
      <b-button
        style="margin: 0.2rem;"
        variant="primary"
        @click="onDeleteUserDataInstances"
      >Delete my all data instances in my pod</b-button>
    </div> -->
  </div>
</template>
<style>
.profile {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
</style>
<script>
import store from "../store/index";
import solidFileClient from "solid-file-client";
import auth from "solid-auth-client";
const N3 = require("n3");
const df = N3.DataFactory;

const poc = "http://web.cmpe.boun.edu.tr/soslab/ontologies/poc#";
const dcterms = "http://purl.org/dc/terms/";
const rdfs = "http://www.w3.org/2000/01/rdf-schema#";
const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const applicationName = "storytelling"; // Application name, this is used to store the users in a graph named accordingly in the sparql server
const appOntology = `http://web.cmpe.boun.edu.tr/soslab/ontologies/${applicationName}#`; // change to your application's uri
const owl = "http://www.w3.org/2002/07/owl#";
const xsd = "http://www.w3.org/2001/XMLSchema#";
const vcard = "http://www.w3.org/2006/vcard/ns#";

export default {
  computed: {
    userRoot() {
      return store.state.userRoot;
    },
    lists() {
      return store.state.lists.map(l => {
        return {
          listName: l.listName,
          list: l.list.filter(
            el => el.from == store.state.userRoot + "/profile/card#me"
          )
        };
      });
    },
    workflowInstances() {
      return store.state.userWorkflowInstances;
    },
    dataInstances() {
      return store.state.userDataInstances;
    }
  },
  methods: {
    simplify(uri) {
      return uri.substring(uri.lastIndexOf("#") + 1);
    },
    simplifyURL(uri) {
      return uri.substring(uri.lastIndexOf("/") + 1);
    },
    simplifyUser(user) {
      return user
        .split("https://")[1]
        .substring(0, user.split("https://")[1].indexOf("."));
    },
    onDeleteUserInfo() {
      store.dispatch("deleteUserInfo", { vue: this });
    },
    onDeleteUserWorkflowInstances() {
      store.dispatch("deleteAllWorkflowInstances", { vue: this });
    },
    onDeleteUserDataInstances() {
      store.dispatch("deleteAllDataInstances", { vue: this });
    },
    workflowInstanceStatus(workflowInstanceFileUrl, workflowURI) {
      store.dispatch("workflowInstanceStatus", {
        vue: this,
        workflowInstanceFileUrl: workflowInstanceFileUrl,
        workflowURI: workflowURI
      });
    }
  }
};
</script>

<style></style>
