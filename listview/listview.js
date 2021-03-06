function ListView(element, adapter, o) {
    var mContainer, // container for item wrappers
        mView, // current view
        mFnHandlers = {}, // helper object - storage for override functions

        mDirection = (o && o.direction) ? o.direction : "vertical", // scrolling direction
        mWrapperClass = o ? o.itemClass : '', // css class for item wrappers
        mUseOpacity = !!(o ? o.useOpacity : false),
        mStealthCount = (o &&  typeof o.stealthCount === 'number') ? Math.abs(o.stealthCount): 0,

        mItemSize = 0, // item size along scroll direction
        mItemWidth, // item width
        mItemHeight, // item height

        mTransformName, // css transformation name with vendor prefix
        mTransitionName,
        mTransitionArray = [], // tmp array for constructing transformation value

        mVisibleHelpers = [], // visible items
        mInvisibleHelpers = [], // recycle container

        UPDATE_DELAY = 1000 / ((o && o.requiredFPS) ? o.requiredFPS : 20), // min delay between items layout update
        mLastLayoutTimestamp = 0, // timestamp of last items layout
        mTmpVariable,

        mLastAdapterIndex = 0, // last visible item index in list
        mFirstAdapterIndex = -1, // first visible item index in list

        mInvisibleCollectorTimeout,

        mItemListener,
        mIsMoving = false,
        mStartPoint,

        STRINGS = {
            pointerdown: 'pointerdown',
            pointermove: 'pointermove',
            pointerup: 'pointerup'
        };

    function calculateItemSize() {
        var item, counts = adapter.getElementsCount(), box, wrapper;

        if (counts === 0)
            return 0;

        item = adapter.getElement(0, null, {width: 0, height: 0});
        wrapper = document.createElement('div');
        wrapper.style.position = 'absolute';
        wrapper.className = mWrapperClass;
        wrapper.appendChild(item);
        mContainer.appendChild(wrapper);

        box = wrapper.getBoundingClientRect();
        mItemHeight = box.height;
        mItemWidth = box.width;
        mContainer.removeChild(wrapper);

        return (mDirection === "vertical") ? mItemHeight : mItemWidth;
    }

    function CreateHelper() {
        var element = document.createElement('div');

        //setup layer
        element.style.position = 'absolute';
        element.style.height = mItemHeight + 'px';
        element.style.width = mItemWidth + 'px';
        element.style.webkitFontSmoothing = 'antialiased';
        element.className = mWrapperClass;

        //setup listener
        if (mItemListener)
            element.addEventListener(o.eventListener.type, mItemListener, o.eventListener.useCapture);

        this.wrapper = element;
        this.item = null;
        this.position = null;
        this.index = 0;
        this.timeout = null;
        this.handler = {
            width: 0,
            height: 0
        };
        this.taskTimestamp = 0;
    }

    function collectInvisibleItems() {
        if (mInvisibleHelpers.length > 1) {
            var key, helper = mInvisibleHelpers.pop(), parent = helper.wrapper.parentNode;

            // remove from DOM
            parent.removeChild(helper.wrapper);

            //remove listener
            if (mItemListener)
                helper.wrapper.removeEventListener(o.eventListener.type, mItemListener);

            // release helper attributes
            for (key in helper) {
                if (helper.hasOwnProperty(key)) {
                    helper[key] = null;
                }
            }

            // post task
            mInvisibleCollectorTimeout = setTimeout(collectInvisibleItems, 150);
        }
    }

    function setInvisible(helper) {
        // push into invisible area only after 100ms to avoid redundant work with DOM
        return setTimeout(function () {
            helper.wrapper.style[mTransformName] = (mDirection !== 'vertical') ? "translate3d(0, 999999px, 0)" : "translate3d(999999px, 0, 0)";
        }, 100);
    }

    function checkHandlersTasks(force) {
        var i, helper, now = window.performance.now();
        for (i = mVisibleHelpers.length - 1; i >= 0; i--) {
            helper = mVisibleHelpers[i];
            if ((helper.taskTimestamp !== 0) && ((now - helper.taskTimestamp > UPDATE_DELAY) || force)) {
                if (helper.index < adapter.getElementsCount()) {
                    var item = adapter.getElement(helper.index, helper.item, helper.handler);
                    helper.wrapper.appendChild(item);
                    helper.item = item;

                    if (mUseOpacity) {
                        helper.item.style[mTransitionName] = 'opacity 150ms ease-in';
                        helper.item.style.opacity = 1;
                    }
                }
                helper.taskTimestamp = 0;
            }
        }
    }

    function prepareItemAndWrapper(helper) {
        // setup wrapper position
        mTransitionArray[1] = helper.position;
        helper.wrapper.style[mTransformName] = mTransitionArray.join("");
        helper.wrapper.setAttribute('data-item', helper.index);

        if (mUseOpacity && helper.item) {
            helper.item.style[mTransitionName] = 'none';
            helper.item.style.opacity = 0;
        }

        // setup task for insert item content
        helper.taskTimestamp = window.performance.now();
    }

    // fill bottom list with items from adapter
    function fillFromTop(containerPosition) {
        var wrapper, helper, itemIndex = mFirstAdapterIndex;
        while (itemIndex >= 0 && (itemIndex + 1 + mStealthCount) * mItemSize > -containerPosition) {
            helper = mInvisibleHelpers.pop() || new CreateHelper();
            helper.handler.width = mItemWidth;
            helper.handler.height = mItemHeight;

            helper.position = itemIndex * mItemSize;
            helper.index = itemIndex;

            wrapper = helper.wrapper;
            if (!wrapper.parentNode) {
                mContainer.appendChild(wrapper);
            } else {
                clearTimeout(helper.timeout);
            }
            helper.timeout = prepareItemAndWrapper(helper);

            itemIndex--;
            mFirstAdapterIndex = itemIndex;

            mVisibleHelpers.unshift(helper);
        }
    }

    // fill top list
    function fillToBottom(containerPosition) {
        var itemsCount = adapter.getElementsCount(), helper, wrapper, itemIndex = mLastAdapterIndex,
            lastBottom = mLastAdapterIndex * mItemSize + containerPosition;

        for (itemIndex; itemIndex < itemsCount && lastBottom < mView._ParentSize + mStealthCount * mItemSize; itemIndex++) {
            lastBottom += mItemSize;
            helper = mInvisibleHelpers.pop() || new CreateHelper();
            helper.handler.width = mItemWidth;
            helper.handler.height = mItemHeight;

            helper.position = itemIndex * mItemSize;
            helper.index = itemIndex;

            wrapper = helper.wrapper;
            if (!wrapper.parentNode) {
                mContainer.appendChild(wrapper);
            } else {
                clearTimeout(helper.timeout);
            }
            helper.timeout = prepareItemAndWrapper(helper);
            mVisibleHelpers.push(helper);
        }
        mLastAdapterIndex = itemIndex;
    }

    // we don't use array "splice" method because it obstructs memory
    function removeVisibleHelper(index) {
        var i, j, result;
        for (i = 0; i < mVisibleHelpers.length; i++) {
            if (i === index) {
                result = mVisibleHelpers[i];
                for (j = i; j < mVisibleHelpers.length - 1; j++) {
                    mVisibleHelpers[j] = mVisibleHelpers[j + 1];
                }
                mVisibleHelpers.length = mVisibleHelpers.length - 1;
                return result;
            }
        }
    }

    // check and remove list items which are outside of the bounds
    function removeInvisibleItems(containerPosition) {
        var helper, i, fromDown, fromUp;

        for (i = mVisibleHelpers.length - 1; i >= 0; i--) {
            helper = mVisibleHelpers[i];
            fromDown = helper.position > mView._ParentSize - containerPosition + mStealthCount * mItemSize;
            fromUp = helper.position + mItemSize * (1 + mStealthCount) < -containerPosition;

            if (fromUp || fromDown) {
                helper.timeout = setInvisible(helper);
                mInvisibleHelpers.push(removeVisibleHelper(i));

                if (fromDown) {
                    mLastAdapterIndex = helper.index;
                } else if (mFirstAdapterIndex < helper.index) {
                    mFirstAdapterIndex = helper.index;
                }
            }
        }
    }

    // complex function for layouting items on the list
    function layoutItems(position) {
        removeInvisibleItems(position);

        if (mView._ParentSize - position > mLastAdapterIndex * mItemSize) {
            fillToBottom(position);
        }
        if (-position < (mFirstAdapterIndex + 1) * mItemSize) {
            fillFromTop(position);
        }
    }

    //======================== construction part ========================
    mTransformName = addVendorPrefix("transform");
    mTransitionName = addVendorPrefix("transition");
    if (mDirection === "vertical") {
        mTransitionArray[0] = "translate3d(0, ";
        mTransitionArray[2] = "px, 0) scale(1)";
    } else {
        mTransitionArray[0] = "translate3d(";
        mTransitionArray[2] = "px, 0, 0) scale(1)";
    }

    //create container for items
    mContainer = document.createElement('div');
    mContainer.style.width = '100%';
    mContainer.style.height = '100%';
    element.insertBefore(mContainer, element.firstChild);

    mView = new ScrollView(element, o);

    if (o && o.eventListener) {
        if (typeof o.eventListener.listener === 'object') {
            mItemListener = function (e) {
                if ((e.type === o.eventListener.type) && !mIsMoving) {
                    o.eventListener.listener.handleEvent(e);
                }
            };
        } else {
            mItemListener = function (e) {
                if ((e.type === o.eventListener.type) && !mIsMoving){
                    o.eventListener.listener(e);
                }
            };
        }
    }

    // ----------------- decorate scroll view methods -------------------
    // override inner method for "refresh"/"reflow"
    mView._calculateMaxScroll = function () {
        var helper, i, tmpWidth = mItemWidth, tmpHeight = mItemHeight, newItemSize = calculateItemSize(),
            itemsCount = adapter.getElementsCount();

        // refresh mLastAdapterIndex, mFirstAdapterIndex and mView.scrollPosition
        if ((mFirstAdapterIndex > itemsCount - 1) || (mFirstAdapterIndex < 0)) {
            if ((itemsCount > 0) && (mFirstAdapterIndex < 0)) {
                mFirstAdapterIndex = - 1;
            } else {
                mFirstAdapterIndex = itemsCount - 1;
            }
            mLastAdapterIndex = mFirstAdapterIndex + 1;

            //remove invisible items
            for (i = mVisibleHelpers.length - 1; i >= 0; i--) {
                helper = mVisibleHelpers[i];
                if (helper.index < mFirstAdapterIndex || helper.index >= mLastAdapterIndex) {
                    helper.timeout = setInvisible(helper);
                    mInvisibleHelpers.push(removeVisibleHelper(i));
                }
            }

            mView.scrollPosition = -Math.max(0, mFirstAdapterIndex) * newItemSize;
        }

        // reflow existing items if new size !== old item size
        if ((tmpWidth !== mItemWidth) || (tmpHeight !== mItemHeight)) {
            var position, wrapper;

            mView.scrollPosition = -(mFirstAdapterIndex + 1) * newItemSize;

            // refresh new items size
            mItemSize = newItemSize;

            // reflow mVisibleItems items
            for (i = mVisibleHelpers.length - 1; i >= 0; i -= 1) {
                helper = mVisibleHelpers[i];

                wrapper = helper.wrapper;
                position = helper.index * mItemSize;
                mTransitionArray[1] = position;

                wrapper.style.height = mItemHeight + 'px';
                wrapper.style.width = mItemWidth + 'px';
                wrapper.style[mTransformName] = mTransitionArray.join("");

                helper.position = position;
                helper.handler.width = mItemWidth;
                helper.handler.height = mItemHeight;
            }

            // reflow mInvisibleItems items
            for (i = mInvisibleHelpers.length - 1; i >= 0; i -= 1) {
                helper = mInvisibleHelpers[i];
                helper.handler.width = mItemWidth;
                helper.handler.height = mItemHeight;

                wrapper = helper.wrapper;
                wrapper.style.height = mItemHeight + 'px';
                wrapper.style.width = mItemWidth + 'px';
            }
        }

        for (i = mVisibleHelpers.length - 1; i >= 0; i -= 1) {
            helper = mVisibleHelpers[i];
            adapter.getElement(helper.index, helper.item, helper.handler);
        }

        // refresh max scroll position
        mView._MaxScroll = mItemSize * adapter.getElementsCount() - mView._ParentSize;

        // refresh scroll position
        mView.setPosition(mView.scrollPosition, true);
        checkHandlersTasks(true);
    };

    // override "setPosition" method
    mFnHandlers.setPosition = mView.setPosition;
    mView.setPosition = function (position, force) {
        // stop collector of invisible items
        clearTimeout(mInvisibleCollectorTimeout);

        // scroll container
        mFnHandlers.setPosition.apply(mView, arguments);

        // layout items if delta time between last update and now more than 1000ms/needUpdateFPS
        mTmpVariable = window.performance.now();
        if ((mTmpVariable - mLastLayoutTimestamp > UPDATE_DELAY) || force) {
            layoutItems(position);
            checkHandlersTasks();
            mLastLayoutTimestamp = mTmpVariable;
        }

        // post task to collect unnecessary invisible items
        mInvisibleCollectorTimeout = setTimeout(collectInvisibleItems, 1000);
    };

    // override "handleEvent"
    mFnHandlers.handleEvent = mView.handleEvent;
    mView.handleEvent = function (e) {
        mFnHandlers.handleEvent.apply(mView, arguments);

        switch (e.type) {
            case STRINGS.pointerdown:
                layoutItems(mView.scrollPosition);
                checkHandlersTasks(true);
                mIsMoving = false;
                mStartPoint = (mDirection === STRINGS.vertical) ? e.screenY : e.screenX;
                break;
            case STRINGS.pointermove:
                if (((mDirection === STRINGS.vertical) ? e.screenY : e.screenX) - mStartPoint > 10) {
                    mIsMoving = true;
                }
                break;
        }
    };
    // -----------------------------------------------------------------

    // prepare first start
    mView.refresh();
    layoutItems(0);

    return mView;
    //===================================================================
}