import axios from "axios";
import {
    loadEventPoliciesInProgress,
    loadEventPoliciesSuccess,
    loadEventPoliciesFailure,
    loadEventCommentsInProgress,
    loadEventCommentsSuccess,
    loadEventCommentsFailure,
    saveCommentInProgress,
    saveCommentDone,
    saveCommentReplyInProgress,
    saveCommentReplyDone,
    loadEventWorkflowsInProgress,
    loadEventWorkflowsSuccess,
    loadEventWorkflowsFailure,
    setEventWorkflowDefinitions,
    setEventWorkflow,
    setEventWorkflowConfiguration,
    doEventWorkflowActionInProgress,
    doEventWorkflowActionSuccess, doEventWorkflowActionFailure,
} from '../actions/eventDetailsActions';
import {addNotification} from "./notificationThunks";
import {NOTIFICATION_CONTEXT} from "../configs/modalConfig";
import {getBaseWorkflow, getWorkflow, getWorkflowDefinitions, getWorkflows} from "../selectors/eventDetailsSelectors";
import {fetchWorkflowDef} from "./workflowThunks";
import {getWorkflowDef} from "../selectors/workflowSelectors";

// prepare http headers for posting to resources
const getHttpHeaders = () => {
    return {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
    };
}

// creates an empty policy with the role from the argument
const createPolicy = (role) => {
    return {
        role: role,
        read: false,
        write: false,
        actions: []
    };
};


// thunks for access policies

export const saveAccessPolicies = (eventId, policies) => async (dispatch) => {

    let headers = getHttpHeaders();

    let data = new URLSearchParams();
    data.append("acl", JSON.stringify(policies));
    data.append("override", true);

    return axios.post(`admin-ng/event/${eventId}/access`, data.toString(), headers)
        .then(response => {
            console.log(response);
            dispatch(addNotification('info', 'SAVED_ACL_RULES', -1, null, NOTIFICATION_CONTEXT));
            return true;
        })
        .catch(response => {
            console.log(response);
            dispatch(addNotification('error', 'ACL_NOT_SAVED', -1, null, NOTIFICATION_CONTEXT));
            return false;
        });
}

export const fetchAccessPolicies = (eventId) => async (dispatch) => {
    try {
        dispatch(loadEventPoliciesInProgress());

        const policyData = await axios.get(`admin-ng/event/${eventId}/access.json`);
        let accessPolicies = await policyData.data;

        let policies = [];
        if(!!accessPolicies.episode_access){
            const json = JSON.parse(accessPolicies.episode_access.acl).acl.ace;
            let newPolicies = {};
            let policyRoles = [];
            for(let i = 0; i < json.length; i++){
                const policy = json[i];
                if(!newPolicies[policy.role]){
                    newPolicies[policy.role] = createPolicy(policy.role);
                    policyRoles.push(policy.role);
                }
                if (policy.action === 'read' || policy.action === 'write') {
                    newPolicies[policy.role][policy.action] = policy.allow;
                } else if (policy.allow === true || policy.allow === 'true'){
                    newPolicies[policy.role].actions.push(policy.action);
                }
            }
            policies = policyRoles.map(role => newPolicies[role]);
        }

        dispatch(loadEventPoliciesSuccess(policies));
    } catch (e) {
        console.log(e);
        dispatch(loadEventPoliciesFailure());
    }
}

export const fetchHasActiveTransactions = (eventId) => async () => {
    try {
        const transactionsData = await axios.get(`admin-ng/event/${eventId}/hasActiveTransaction`);
        const hasActiveTransactions = await transactionsData.data;
        return hasActiveTransactions;
    } catch (e) {
        console.log(e);
    }
}


// thunks for comments

export const fetchComments = (eventId) => async (dispatch) => {
    try {
        dispatch(loadEventCommentsInProgress());

        const commentsData = await axios.get(`admin-ng/event/${eventId}/comments`);
        const comments = await commentsData.data;

        const commentReasonsData = await axios.get(`admin-ng/resources/components.json`);
        const commentReasons = (await commentReasonsData.data).eventCommentReasons;

        dispatch(loadEventCommentsSuccess(comments, commentReasons));
    } catch (e) {
        dispatch(loadEventCommentsFailure());
        console.log(e);
    }
}

export const saveComment = (eventId, commentText, commentReason) => async (dispatch) => {
    try {
        dispatch(saveCommentInProgress());

        let headers = getHttpHeaders();

        let data = new URLSearchParams();
        data.append("text", commentText);
        data.append("reason", commentReason);

        const commentSaved = await axios.post(`admin-ng/event/${eventId}/comment`,
            data.toString(), headers );
        await commentSaved.data;

        dispatch(saveCommentDone());
        return true;
    } catch (e) {
        dispatch(saveCommentDone());
        console.log(e);
        return false;
    }
}

export const deleteComment = (eventId, commentId) => async () => {
    try {
        const commentDeleted = await axios.delete(`admin-ng/event/${eventId}/comment/${commentId}`);
        await commentDeleted.data;
        return true;
    } catch (e) {
        console.log(e);
        return false;
    }
}

export const saveCommentReply = (eventId, commentId, replyText, commentResolved) => async (dispatch) => {
    try {
        dispatch(saveCommentReplyInProgress());

        let headers = getHttpHeaders();

        let data = new URLSearchParams();
        data.append("text", replyText);
        data.append("resolved", commentResolved);

        const commentReply = await axios.post(`admin-ng/event/${eventId}/comment/${commentId}/reply`,
            data.toString(), headers );

        await commentReply.data;

        dispatch(saveCommentReplyDone());
        return true;
    } catch (e) {
        dispatch(saveCommentReplyDone());
        console.log(e);
        return false;
    }
}

export const deleteCommentReply = (eventId, commentId, replyId) => async () => {
    try {
        const commentReplyDeleted = await axios.delete(`admin-ng/event/${eventId}/comment/${commentId}/${replyId}`);
        await commentReplyDeleted.data;

        return true;
    } catch (e) {
        console.log(e);
        return false;
    }
}


// thunks for workflows

export const fetchWorkflows = (eventId) => async (dispatch, getState) => {
    try {
        dispatch(loadEventWorkflowsInProgress());

        const data = await axios.get(`admin-ng/event/${eventId}/workflows.json`);
        const workflowsData = await data.data;

        if(!!workflowsData.results){
            const workflows = {
                entries: workflowsData.results,
                scheduling: false,
                workflow: {
                    id: "",
                    description: ""
                }
            };

            dispatch(loadEventWorkflowsSuccess(workflows));
        } else {
            const workflows = {
                workflow: workflowsData,
                scheduling: true,
                entries: []
            };

            await dispatch(fetchWorkflowDef('event-details'));

            const state = getState();

            const workflowDefinitions = getWorkflowDef(state);

            dispatch(setEventWorkflowDefinitions(workflows, workflowDefinitions));
            dispatch(changeWorkflow(false));

            dispatch(loadEventWorkflowsSuccess(workflows));
        }
    } catch (e) {
        dispatch(loadEventWorkflowsFailure());
        console.log(e);
    }
}

const changeWorkflow = (saveWorkflow) => async (dispatch, getState) => {
    const state = getState();
    const workflow = getWorkflow(state);

    if(!!workflow.workflowId){
        dispatch(setEventWorkflowConfiguration(workflow));
    } else {
        dispatch(setEventWorkflowConfiguration(getBaseWorkflow(state)));
    }
    if(saveWorkflow){
        saveWorkflowConfig();
    }
}

export const updateWorkflow = (saveWorkflow, workflowId) => async (dispatch, getState) => {
    const state = getState();
    const workflowDefinitions = getWorkflowDefinitions(state);
    const workflowDef = workflowDefinitions.find(def => def.id === workflowId);
    await dispatch(setEventWorkflow({
        workflowId: workflowId,
        description: workflowDef.description,
        configuration: workflowDef.configuration
    }));
    dispatch(changeWorkflow(saveWorkflow));
}

const saveWorkflowConfig = () => {
    //todo
}

export const performWorkflowAction = (eventId, workflowId, action, close) => async (dispatch) => {
    dispatch(doEventWorkflowActionInProgress());

    let headers = {headers: {
        'Content-Type': 'application/json;charset=utf-8'
    }};

    let data = new URLSearchParams();
    data.append("action", action);
    data.append("id", eventId);
    data.append("wfId", workflowId);

    axios.put(`admin-ng/event/${eventId}/workflows/${workflowId}/action/${action}`, data, headers)
        .then( response => {
            dispatch(addNotification('success', 'EVENTS_PROCESSING_ACTION_' + action, -1, null, NOTIFICATION_CONTEXT));
            dispatch(doEventWorkflowActionSuccess());
        })
        .catch( response => {
            dispatch(addNotification('error', 'EVENTS_PROCESSING_ACTION_NOT_' + action, -1, null, NOTIFICATION_CONTEXT));
            close();
            dispatch(doEventWorkflowActionFailure());
        });
}