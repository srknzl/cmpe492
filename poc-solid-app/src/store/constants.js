const rootACL = (rootURI) => {
  return `
# Default ACL resource 

@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

<#owner>
a acl:Authorization;

acl:agent
<${rootURI}/profile/card#me>;

acl:accessTo <./>;
acl:default <./>;

acl:mode
acl:Read, acl:Write, acl:Control.

<#authorization>
a               acl:Authorization;
acl:accessTo <./>;
acl:default <./>;
acl:mode        acl:Read,
                acl:Write;
acl:agentGroup  <http://serkanozel.me/pocUsers.ttl#poc>.
`;
};

const workflowInstanceTTL = (workflow, user, randomString) => {
  return `
@prefix services: <http://web.cmpe.boun.edu.tr/soslab/ontologies/poc/services#> .
@prefix poc: <http://web.cmpe.boun.edu.tr/soslab/ontologies/poc#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<> a poc:WorkflowInstance;
poc:datatype <${workflow}>;
poc:status "ongoing";
dcterms:created "${new Date().toISOString()}"^^xsd:dateTime;
dcterms:creator <${user}>;
services:stepInstances <${randomString}_step_instances>.`;
};

const stepInstanceTTL = (stepURI, userURI) => {
  return `
@prefix services: <http://web.cmpe.boun.edu.tr/soslab/ontologies/poc/services#> .
@prefix poc: <http://web.cmpe.boun.edu.tr/soslab/ontologies/poc#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<> a poc:StepInstance;
poc:datatype <${stepURI}>;
dcterms:created "${new Date().toISOString()}"^^xsd:dateTime;
dcterms:creator <${userURI}>;
poc:status "pending".
`;
  // add services:performer and services:performedAt, update status after performal of the step instance

}
const URIValueBinding = (URI) => {
  return `  
@prefix poc: <http://web.cmpe.boun.edu.tr/soslab/ontologies/poc#> .

<> a poc:ValueBinding;
poc:uriValue <${URI}>.
  `;

}

const literalValueBinding = (value, xsdDatatype) => {

  if (typeof value == Date) {
    return `  
@prefix poc: <http://web.cmpe.boun.edu.tr/soslab/ontologies/poc#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<> a poc:ValueBinding;
poc:literalValue "${value.toISOString()}"^^${'xsd:' + xsdDatatype}.
  `;
  } else {
    return `  
@prefix poc: <http://web.cmpe.boun.edu.tr/soslab/ontologies/poc#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<> a poc:ValueBinding;
poc:literalValue "${value}"^^${'xsd:' + xsdDatatype}.
  `;
  }


}

const compositeDataInstance = (fieldArray, datatype) => {
  let fieldValues = "";
  fieldArray.forEach((x, index, array) => {
    if (x.type == "literal") {
      fieldValues += `[ rdfs:label "${x.label}"; poc:literalValue "${x.value}"^^xsd:${x.typeName}]`;
    } else {
      fieldValues += `[ rdfs:label "${x.label}"; poc:uriValue <${x.value}>]`;
    }

    if (index == fieldArray.length - 1) {
      fieldValues += ".";
    } else {
      fieldValues += ",";
    }
  });

  return `
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix dcterms: <http://purl.org/dc/terms/>.
@prefix poc: <http://web.cmpe.boun.edu.tr/soslab/ontologies/poc#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
<> a poc:CompositeDataInstance;
  poc:datatype <${datatype}>;
  poc:fieldValue ${fieldValues}
  
`;
};

// console.log(compositeDataInstance([{ label: "Name", value: "American Haircut", type: "literal", typeName: "string" }, { label: "Difficulty", value: "3", type: "literal", typeName: "integer" }, { label: "Photo", value: "http://example.org/mySmallImage", type: "uri", typeName: "" }],"http://example.org/Haircut"))



module.exports = {
  rootACL: rootACL,
  workflowInstanceTTL: workflowInstanceTTL,
  stepInstanceTTL: stepInstanceTTL,
  URIValueBinding: URIValueBinding,
  literalValueBinding: literalValueBinding,
  compositeDataInstance: compositeDataInstance
};
