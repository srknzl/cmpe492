<template>
  <div class="home">
    <div v-if="fetching && loggedIn" class="d-flex justify-content-center mb-3">
      <b-spinner label="Loading..."></b-spinner>
      <p>Fetching specification and data from user pods</p>
    </div>

    <h1>Current App:</h1>
    <p>{{simplifyURL(appUri) || "Current application does not have a name or spec not loaded"}}</p>
    <h1>Description:</h1>
    <p>{{appDesc || "Current application does not have a description or spec not loaded"}}</p>
    <b-card class="poccontainer">
      <b-card-header header-tag="header" role="tab">
        <b-button
          block
          v-b-toggle.accordion-7
          class="d-flex justify-content-start"
          variant="primary"
        >
          <h3>Users</h3>
        </b-button>
      </b-card-header>
      <b-collapse id="accordion-7">
        <p v-if="users.length == 0">No users</p>
        <p v-for="(u,ind) in users" :key="ind">
          {{ind+1}}:
          <a :href="u.object.value" target="_blank">{{simplifyUser(u.object.value)}}</a>
        </p>
      </b-collapse>
    </b-card>
    <b-card style="marginTop: 1rem;" class="poccontainer">
      <b-card-header header-tag="header" role="tab">
        <b-button
          block
          v-b-toggle.accordion-4
          class="d-flex justify-content-start"
          variant="primary"
        >
          <h3>Datatypes</h3>
        </b-button>
      </b-card-header>
      <b-collapse id="accordion-4">
        <p v-if="compositeDatatypes.length == 0">No datatypes</p>
        <b-card
          style="marginTop: 1rem;"
          class="poccontainer"
          v-for="(d,ind) in compositeDatatypes"
          :key="ind"
        >
          <h3>{{ind+1}}.{{simplify(d.uri).charAt(0).toUpperCase() + simplify(d.uri).slice(1)}}</h3>
          <b-card class="poccontainer" v-for="(x,ind2) in d.datafields" :key="ind2">
            <p>
              <b>Name:</b>
              {{simplify(x.name)}}
            </p>
            <p>
              <b>Description:</b>
              {{simplify(x.description)}}
            </p>
            <!-- <p>
              <b>Fieldtype:</b>
              {{simplify(x.fieldtype)}}
            </p>-->
          </b-card>
        </b-card>
      </b-collapse>
    </b-card>
    <!--   <b-card style="marginTop: 1rem;" class="poccontainer">
      <b-card-header header-tag="header" role="tab">
        <b-button
          block
          v-b-toggle.accordion-5
          class="d-flex justify-content-start"
          variant="primary"
        >
          <h3>Derived Datatypes</h3>
        </b-button>
      </b-card-header>
      <b-collapse id="accordion-5">
        <p v-if="derivedDatatypes.length == 0">No derived datatypes</p>
        <b-card style="marginTop: 1rem;" v-for="(d,ind) in derivedDatatypes" :key="ind">
          <h3>
            Derived Datatype {{ind+1}}:
            <a :href="d.uri" target="_blank">{{d.uri}}</a>
          </h3>
          <p v-if="d.limitations.maxFrameWidth">maxFrameWidth: {{d.limitations.maxFrameWidth}}</p>
          <p v-if="d.limitations.minFrameWidth">minFrameWidth: {{d.limitations.minFrameWidth}}</p>
          <p v-if="d.limitations.maxFrameHeight">maxFrameHeight: {{d.limitations.maxFrameHeight}}</p>
          <p v-if="d.limitations.minFrameHeight">minFrameHeight: {{d.limitations.minFrameHeight}}</p>
          <p v-if="d.limitations.maxTrackLength">maxTrackLength: {{d.limitations.maxTrackLength}}</p>
          <p v-if="d.limitations.minTrackLength">minTrackLength: {{d.limitations.minTrackLength}}</p>
          <p v-if="d.limitations.maxFileSize">maxFileSize: {{d.limitations.maxFileSize}}</p>
          <p v-if="d.limitations.minFileSize">minFileSize: {{d.limitations.minFileSize}}</p>
          <p v-if="d.limitations.scaleWidth">scaleWidth: {{d.limitations.scaleWidth}}</p>
          <p v-if="d.limitations.scaleHeight">scaleHeight: {{d.limitations.scaleHeight}}</p>
          <p v-if="d.limitations.maxSize">maxSize: {{d.limitations.maxSize}}</p>
        </b-card>
      </b-collapse>
    </b-card>-->
    <b-card style="marginTop: 1rem;" class="poccontainer">
      <b-card-header header-tag="header" role="tab">
        <b-button
          block
          v-b-toggle.accordion-1
          class="d-flex justify-content-start"
          variant="primary"
        >
          <h3>Tasks</h3>
        </b-button>
      </b-card-header>
      <b-collapse id="accordion-1" style="marginTop: 1rem;" v-for="(w,ind) in workflows" :key="ind">
        <p v-if="workflows.length == 0">No tasks</p>
        <b-card class="poccontainer">
          <h3>
            {{ind+1}}.{{simplify(w.label)}}
          </h3>

          <p v-if="w.description">
            <b>Description:</b>
            {{simplify(w.description)}}
          </p>
          <b-button variant="success" @click="onWorkflowInvoke(w)">Start</b-button>
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
          <h3>Content</h3>
        </b-button>
      </b-card-header>
      <b-collapse id="accordion-2">
        <p v-if="lists.length == 0">No content</p>
        <b-card v-for="(l,ind) in lists" :key="ind" class="poccontainer">
          <p>
            <b>{{ind+1}}.{{simplify(l.listName)}}</b> 
          </p>
          <p v-if="l.list.length == 0">No items</p>
          <p v-if="l.list.length > 0">
            <b>Items:</b>
          </p>
          <ul v-if="l.list.length > 0">
            <li v-for="(item, indice) in l.list" :key="indice">
              <p v-if="item.termType == 'Literal'">
                <u>Literal Value:</u>
                <br />
                <b>Datatype:</b>
                {{simplify(item.datatype.value)}}
                <br />
                <b>Value:</b>
                {{item.value}}
                <br />
                <b>From:</b>
                {{simplifyUser(item.from)}}
              </p>
              <p v-if="item.termType == 'NamedNode'">
                <b>Value:</b>
                <a :href="item.value" target="_blank">{{simplifyURL(item.value)}}</a>  from <a :href="'https://'+simplifyUser(item.value)+'.solid.community/profile/card#me'" target="_blank">{{simplifyUser(item.value)}}</a> 
                <br />
                <b>Contributor:</b>
                {{simplifyUser(item.from)}}
              </p>
            </li>
          </ul>
        </b-card>
      </b-collapse>
    </b-card>
    <!--   <b-card style="marginTop: 1rem;" class="poccontainer">
      <b-card-header header-tag="header" role="tab">
        <b-button
          block
          v-b-toggle.accordion-3
          class="d-flex justify-content-start"
          variant="primary"
        >
          <h3>Workflow Instances</h3>
        </b-button>
      </b-card-header>
      <b-collapse id="accordion-3">
        <p v-if="workflowInstances.length == 0">No workflow instances</p>
        <b-card v-for="(w,ind) in workflowInstances" :key="ind" class="poccontainer">
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
        </b-card>
      </b-collapse>
    </b-card>-->
    <!-- <b-card style="marginTop: 1rem;" class="poccontainer">
      <b-card-header header-tag="header" role="tab">
        <b-button
          block
          v-b-toggle.accordion-6
          class="d-flex justify-content-start"
          variant="primary"
        >
          <h3>Data Instances</h3>
        </b-button>
      </b-card-header>
      <b-collapse id="accordion-6">
        <p v-if="dataInstances.length == 0">No data instances</p>
        <b-card v-for="(d,ind) in dataInstances" :key="ind" class="poccontainer">
          <p>
            <b>Data Instance {{ind+1}}:</b>

            <a :href="d.url" target="_blank">{{d.uri}}</a>
          </p>
          <p>
            <b>Created</b>
            {{d.created}}
          </p>
          <p>
            <b>Creator</b>
            {{d.creator}}
          </p>
          <p v-if="d.datatype">
            <b>Datatype</b>
            {{d.datatype}}
          </p>
        </b-card>
      </b-collapse>
    </b-card>-->
  </div>
</template>
<style>
.poccontainer {
  border: 1px solid green;
  font-size: 20px;
  border-radius: 10px;
  padding: 10px;
}
</style>
<script>
import store from "../store/index";
const N3 = require("n3");
const df = N3.DataFactory;
// It is not reasonable to show all data instances to the user
// It is reasonable to show contents of all lists to the user
// It is not reasonable to show step instances to the user

export default {
  name: "Poc",
  components: {},
  methods: {
    onWorkflowInvoke(workflow) {
      store.dispatch("createWorkflowInstance", {
        workflowURI: workflow.uri,
        userWebID: this.user,
        vue: this
      });
    },
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
    }
  },
  created() {},
  computed: {
    workflowInstances() {
      return store.state.workflowInstances;
    },
    fetching() {
      return store.state.fetching;
    },
    users() {
      return store.state.users;
    },
    user() {
      return store.state.user;
    },
    compositeDatatypes() {
      return store.state.compositeDatatypes;
    },
    derivedDatatypes() {
      return store.state.derivedDatatypes;
    },
    lists() {
      return store.state.lists.sort((a, b) => a.from > b.from);
    },
    appDesc() {
      return store.state.appDesc;
    },
    appUri() {
      return store.state.appUri;
    },
    workflows() {
      return store.state.workflows;
    },
    dataInstances() {
      return store.state.dataInstances;
    },
    loggedIn() {
      return store.state.loggedIn;
    }
  }
};
</script>
