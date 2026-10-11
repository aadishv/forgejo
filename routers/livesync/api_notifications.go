// Copyright 2026 The Forgejo Authors. All rights reserved.
// SPDX-License-Identifier: GPL-3.0-or-later

package livesync

import (
	"context"
	"errors"
	"net/http"

	activities_model "forgejo.org/models/activities"
	auth_model "forgejo.org/models/auth"
	"forgejo.org/models/db"
	"forgejo.org/services/livesync/protocol"
)

// The status of several notifications in one request (protocol/api.go).
// API v1 sets one thread per request (PATCH /notifications/threads/{id}) or
// every notification of some statuses before a time (PUT /notifications);
// undoing "Mark all read" needs exactly the notifications it marked, back to
// unread, without one request each. Each is set as API v1's thread PATCH
// does (activities_model.SetNotificationStatus).

// notificationWriteScope is API v1's for the same change.
const notificationWriteScope = auth_model.AccessTokenScopeWriteNotification

// apiNotificationStatus answers PUT /-/sync/api/notifications/status.
func apiNotificationStatus(w http.ResponseWriter, req *http.Request) {
	a := apiAuth(w, req, notificationWriteScope)
	if a == nil {
		return
	}
	var body protocol.APINotificationStatus
	if !a.decode(&body) {
		return
	}
	var status activities_model.NotificationStatus
	switch body.Status {
	case "unread":
		status = activities_model.NotificationStatusUnread
	case "read":
		status = activities_model.NotificationStatusRead
	case "pinned":
		status = activities_model.NotificationStatusPinned
	default:
		a.error(http.StatusUnprocessableEntity, "status must be unread, read or pinned")
		return
	}
	if len(body.IDs) == 0 || len(body.IDs) > protocol.APINotificationStatusMax {
		a.error(http.StatusUnprocessableEntity, "ids must name between 1 and 1000 notifications")
		return
	}
	err := db.WithTx(a.ctx, func(ctx context.Context) error {
		for _, id := range body.IDs {
			n, err := activities_model.GetNotificationByID(ctx, id)
			if err != nil {
				if db.IsErrNotExist(err) {
					continue // deleted meanwhile: nothing to set
				}
				return err
			}
			if n.UserID != a.viewer.ID {
				return errNotYours
			}
			if n.Status == status {
				continue
			}
			if _, err := activities_model.SetNotificationStatus(ctx, id, a.viewer, status); err != nil {
				return err
			}
		}
		return nil
	})
	switch {
	case errors.Is(err, errNotYours):
		// Another user's notification is not readable: as one that does not exist.
		a.notFound()
	case err != nil:
		a.internal("set the notifications' status", err)
	default:
		a.noContent()
	}
}

var errNotYours = errors.New("another user's notification")
