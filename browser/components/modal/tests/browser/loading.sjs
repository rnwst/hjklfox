/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function finishImage(response) {
  response.setHeader("Content-Type", "image/svg+xml", false);
  response.write(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"></svg>'
  );
  response.finish();
}

function handleRequest(request, response) {
  response.setHeader("Cache-Control", "no-store", false);
  if (request.queryString === "image") {
    response.processAsync();
    if (getState("finish") === "yes") {
      setState("finish", "");
      finishImage(response);
    } else {
      setObjectState("image", response);
    }
  } else if (request.queryString === "finish") {
    getObjectState("image", image => {
      if (image) {
        finishImage(image);
        setObjectState("image", null);
      } else {
        setState("finish", "yes");
      }
    });
    response.write("OK");
  } else {
    setState("finish", "");
    setObjectState("image", null);
    response.setHeader("Content-Type", "text/html", false);
    response.write(
      '<!doctype html><title>Loading modal test</title><img src="loading.sjs?image"><br><a id="target" href="#followed">Follow this link</a>'
    );
  }
}
