/**
 * Shared delete helper: Super Admin deletes immediately;
 * everyone else gets HTTP 202 (approval required).
 */
export function explainDeleteResponse(response) {
  const data = response?.data || {};
  if (response?.status === 202 || data.requires_approval) {
    return {
      requiresApproval: true,
      title: "Approval required",
      text:
        data.message ||
        "Delete request sent to Super Admin. Nothing was deleted yet.",
      deletionRequest: data.deletion_request || null,
    };
  }
  return {
    requiresApproval: false,
    title: "Deleted!",
    text: data.message || "Deleted successfully",
    deletionRequest: null,
  };
}

export function explainDeleteError(err) {
  const data = err?.response?.data;
  return data?.message || err?.message || "Delete failed";
}
