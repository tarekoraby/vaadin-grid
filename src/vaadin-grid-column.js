/**
@license
Copyright (c) 2018 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
import { PolymerElement } from '@polymer/polymer/polymer-element.js';

import { FlattenedNodesObserver } from '@polymer/polymer/lib/utils/flattened-nodes-observer.js';
import { DirMixin } from '@vaadin/vaadin-element-mixin/vaadin-dir-mixin.js';
import { Debouncer } from '@polymer/polymer/lib/utils/debounce.js';
import { animationFrame } from '@polymer/polymer/lib/utils/async.js';

/**
 * @polymerMixin
 */
export const ColumnBaseMixin = superClass => class ColumnBaseMixin extends superClass {
  static get properties() {
    return {
      /**
       * When set to true, the column is user-resizable.
       * @default false
       */
      resizable: {
        type: Boolean,
        value: function() {
          if (this.localName === 'vaadin-grid-column-group') {
            return;
          }

          const parent = this.parentNode;
          if (parent && parent.localName === 'vaadin-grid-column-group') {
            return parent.resizable || false;
          } else {
            return false;
          }
        }
      },

      /**
       * When true, the column is frozen. When a column inside of a column group is frozen,
       * all of the sibling columns inside the group will get frozen also.
       * @type {boolean}
       */
      frozen: {
        type: Boolean,
        value: false
      },

      /**
       * When set to true, the cells for this column are hidden.
       */
      hidden: {
        type: Boolean
      },

      /**
       * Text content to display in the header cell of the column.
       */
      header: {
        type: String
      },

      /**
       * Aligns the columns cell content horizontally.
       * Supported values: "start", "center" and "end".
       * @attr {start|center|end} text-align
       * @type {GridColumnTextAlign | null | undefined}
       */
      textAlign: {
        type: String
      },

      /**
       * @type {boolean}
       * @protected
       */
      _lastFrozen: {
        type: Boolean,
        value: false
      },

      /** @protected */
      _order: Number,

      /** @private */
      _reorderStatus: Boolean,

      /**
       * @type {Array<!HTMLElement>}
       * @protected
       */
      _emptyCells: Array,

      /** @private */
      _headerCell: Object,

      /** @private */
      _footerCell: Object,

      /** @protected */
      _grid: Object,

      /**
       * Custom function for rendering the header content.
       * Receives two arguments:
       *
       * - `root` The header cell content DOM element. Append your content to it.
       * - `column` The `<vaadin-grid-column>` element.
       *
       * @type {GridHeaderFooterRenderer | null | undefined}
       */
      headerRenderer: Function,

      /**
       * Custom function for rendering the footer content.
       * Receives two arguments:
       *
       * - `root` The footer cell content DOM element. Append your content to it.
       * - `column` The `<vaadin-grid-column>` element.
       *
       * @type {GridHeaderFooterRenderer | null | undefined}
       */
      footerRenderer: Function
    };
  }

  static get observers() {
    return [
      '_widthChanged(width, _headerCell, _footerCell, _cells.*)',
      '_frozenChanged(frozen, _headerCell, _footerCell, _cells.*)',
      '_flexGrowChanged(flexGrow, _headerCell, _footerCell, _cells.*)',
      '_pathOrHeaderChanged(path, header, _headerCell, _footerCell, _cells.*, renderer, headerRenderer)',
      '_textAlignChanged(textAlign, _cells.*, _headerCell, _footerCell)',
      '_orderChanged(_order, _headerCell, _footerCell, _cells.*)',
      '_lastFrozenChanged(_lastFrozen)',
      '_setBodyRenderer(renderer, _cells, _cells.*)',
      '_setHeaderRenderer(headerRenderer, _headerCell)',
      '_setFooterRenderer(footerRenderer, _footerCell)',
      '_resizableChanged(resizable, _headerCell)',
      '_reorderStatusChanged(_reorderStatus, _headerCell, _footerCell, _cells.*)',
      '_hiddenChanged(hidden, _headerCell, _footerCell, _cells.*)'
    ];
  }

  /** @protected */
  connectedCallback() {
    super.connectedCallback();

    requestAnimationFrame(() => {
      this._allCells.forEach(cell => {
        if (!cell._content.parentNode) {
          this._grid && this._grid.appendChild(cell._content);
        }
      });
    });
  }

  /** @protected */
  disconnectedCallback() {
    super.disconnectedCallback();

    requestAnimationFrame(() => {
      if (!this._findHostGrid()) {
        this._allCells.forEach(cell => {
          if (cell._content.parentNode) {
            cell._content.parentNode.removeChild(cell._content);
          }
        });
      }
    });

    this._gridValue = undefined;
  }

  /**
   * @return {!GridElement | undefined}
   * @protected
   */
  _findHostGrid() {
    let el = this;
    // Custom elements extending grid must have a specific localName
    while (el && !/^vaadin.*grid(-pro)?$/.test(el.localName)) {
      el = el.assignedSlot ? el.assignedSlot.parentNode : el.parentNode;
    }
    return el || undefined;
  }

  /**
   * @return {!GridElement | undefined}
   * @protected
   */
  get _grid() {
    if (!this._gridValue) {
      this._gridValue = this._findHostGrid();
    }
    return this._gridValue;
  }

  /**
   * @return {!Array<!HTMLElement>}
   * @protected
   */
  get _allCells() {
    return []
      .concat(this._cells || [])
      .concat(this._emptyCells || [])
      .concat(this._headerCell)
      .concat(this._footerCell)
      .filter(cell => cell);
  }

  /** @protected */
  _renderHeaderAndFooter() {
    if (this.headerRenderer && this._headerCell) {
      this.__runRenderer(this.headerRenderer, this._headerCell);
    }
    if (this.footerRenderer && this._footerCell) {
      this.__runRenderer(this.footerRenderer, this._footerCell);
    }
  }

  /** @private */
  __runRenderer(renderer, cell, model) {
    const args = [cell._content, this];
    if (model && model.item) {
      args.push(model);
    }
    renderer.apply(this, args);
  }

  /** @private */
  __setColumnRenderer(renderer, cells) {
    cells.forEach(cell => {
      const model = this._grid.__getRowModel(cell.parentElement);

      if (renderer) {
        cell._renderer = renderer;

        if (model.item || renderer === this.headerRenderer || renderer === this.footerRenderer) {
          this.__runRenderer(renderer, cell, model);
        }
      }
    });
  }

  /** @private */
  _setBodyRenderer(renderer, cells, splices) {
    if (renderer && cells) {
      this.__setColumnRenderer(renderer, cells);
    }
  }

  /** @private */
  _setHeaderRenderer(headerRenderer, headerCell) {
    if (headerRenderer && headerCell) {
      this.__setColumnRenderer(headerRenderer, [headerCell]);
    }
  }

  /** @private */
  _setFooterRenderer(footerRenderer, footerCell) {
    if (footerRenderer && footerCell) {
      this.__setColumnRenderer(footerRenderer, [footerCell]);
      this._grid.__updateHeaderFooterRowVisibility(footerCell.parentElement);
    }
  }

  /** @private */
  _flexGrowChanged(flexGrow, headerCell, footerCell, cells) {
    if (this.parentElement && this.parentElement._columnPropChanged) {
      this.parentElement._columnPropChanged('flexGrow');
    }

    this._allCells.forEach(cell => cell.style.flexGrow = flexGrow);
  }

  /** @private */
  _orderChanged(order, headerCell, footerCell, cells) {
    this._allCells.forEach(cell => cell.style.order = order);
  }

  /** @private */
  _widthChanged(width, headerCell, footerCell, cells) {
    if (this.parentElement && this.parentElement._columnPropChanged) {
      this.parentElement._columnPropChanged('width');
    }

    this._allCells.forEach(cell => cell.style.width = width);

    // Force a reflow to workaround browser issues causing double scrollbars to grid
    // https://github.com/vaadin/vaadin-grid/issues/1586
    if (this._grid && this._grid.__forceReflow) {
      this._grid.__forceReflow();
    }
  }

  /** @private */
  _frozenChanged(frozen, headerCell, footerCell, cells) {
    if (this.parentElement && this.parentElement._columnPropChanged) {
      this.parentElement._columnPropChanged('frozen', frozen);
    }

    this._allCells.forEach(cell => this._toggleAttribute('frozen', frozen, cell));

    this._grid && this._grid._frozenCellsChanged && this._grid._frozenCellsChanged();
  }

  /** @private */
  _lastFrozenChanged(lastFrozen) {
    this._allCells.forEach(cell => this._toggleAttribute('last-frozen', lastFrozen, cell));

    if (this.parentElement && this.parentElement._columnPropChanged) {
      this.parentElement._lastFrozen = lastFrozen;
    }
  }

  /**
   * @param {string | undefined} path
   * @param {string | undefined} header
   * @param {!HTMLTableCellElement | undefined} headerCell
   * @param {!HTMLTableCellElement | undefined} footerCell
   * @param {!object | undefined} cells
   * @param {GridBodyRenderer | undefined} renderer
   * @param {GridHeaderFooterRenderer | undefined} headerRenderer
   * @protected
   */
  _pathOrHeaderChanged(path, header, headerCell, footerCell, cells, renderer, headerRenderer) {
    const hasHeaderText = header !== undefined;
    if (!headerRenderer && hasHeaderText && headerCell) {
      this.__setTextContent(headerCell._content, header);
    }

    if (path && cells.value) {
      if (!renderer) {
        const pathRenderer = (root, owner, {item}) => this.__setTextContent(root, this.get(path, item));
        this.__setColumnRenderer(undefined, pathRenderer, cells.value);
      }

      if (!headerRenderer && !hasHeaderText && headerCell && header !== null) {
        this.__setTextContent(headerCell._content, this._generateHeader(path));
      }
    }

    if (headerCell) {
      this._grid.__updateHeaderFooterRowVisibility(headerCell.parentElement);
    }
  }

  /** @private */
  __setTextContent(node, textContent) {
    node.textContent !== textContent && (node.textContent = textContent);
  }

  /**
   * @param {string} path
   * @return {string}
   * @protected
   */
  _generateHeader(path) {
    return path
      .substr(path.lastIndexOf('.') + 1)
      .replace(/([A-Z])/g, '-$1').toLowerCase()
      .replace(/-/g, ' ')
      .replace(/^./, match => match.toUpperCase());
  }

  /**
   * @param {string} name
   * @param {boolean} bool
   * @param {!Element} node
   * @protected
   */
  _toggleAttribute(name, bool, node) {
    if (node.hasAttribute(name) === !bool) {
      if (bool) {
        node.setAttribute(name, '');
      } else {
        node.removeAttribute(name);
      }
    }
  }

  /** @private */
  _reorderStatusChanged(reorderStatus, headerCell, footerCell, cells) {
    this._allCells.forEach(cell => cell.setAttribute('reorder-status', reorderStatus));
  }

  /** @private */
  _resizableChanged(resizable, headerCell) {
    if (resizable === undefined || headerCell === undefined) {
      return;
    }

    if (headerCell) {
      [headerCell].concat(this._emptyCells).forEach(cell => {
        if (cell) {
          const existingHandle = cell.querySelector('[part~="resize-handle"]');
          if (existingHandle) {
            cell.removeChild(existingHandle);
          }

          if (resizable) {
            const handle = document.createElement('div');
            handle.setAttribute('part', 'resize-handle');
            cell.appendChild(handle);
          }
        }
      });
    }
  }

  /** @private */
  _textAlignChanged(textAlign, _cells, _headerCell, _footerCell) {
    if (textAlign === undefined) {
      return;
    }
    if (['start', 'end', 'center'].indexOf(textAlign) === -1) {
      console.warn('textAlign can only be set as "start", "end" or "center"');
      return;
    }

    let textAlignFallback;
    if (getComputedStyle(this._grid).direction === 'ltr') {
      if (textAlign === 'start') {
        textAlignFallback = 'left';
      } else if (textAlign === 'end') {
        textAlignFallback = 'right';
      }
    } else {
      if (textAlign === 'start') {
        textAlignFallback = 'right';
      } else if (textAlign === 'end') {
        textAlignFallback = 'left';
      }
    }

    this._allCells.forEach(cell => {
      cell._content.style.textAlign = textAlign;
      if (getComputedStyle(cell._content).textAlign !== textAlign) {
        cell._content.style.textAlign = textAlignFallback;
      }
    });
  }

  /** @private */
  _hiddenChanged(hidden, headerCell, footerCell, cells) {
    if (this.parentElement && this.parentElement._columnPropChanged) {
      this.parentElement._columnPropChanged('hidden', hidden);
    }

    if (!!hidden !== !!this._previousHidden && this._grid) {
      if (hidden === true) {
        this._allCells.forEach(cell => {
          if (cell._content.parentNode) {
            cell._content.parentNode.removeChild(cell._content);
          }
        });
      }
      this._grid._debouncerHiddenChanged = Debouncer.debounce(
        this._grid._debouncerHiddenChanged,
        animationFrame,
        () => {
          if (this._grid && this._grid._renderColumnTree) {
            this._grid._renderColumnTree(this._grid._columnTree);
          }
        }
      );

      this._grid._updateLastFrozen && this._grid._updateLastFrozen();
      this._grid.notifyResize && this._grid.notifyResize();
      this._grid._resetKeyboardNavigation && this._grid._resetKeyboardNavigation();
    }
    this._previousHidden = hidden;
  }

};

/**
 * A `<vaadin-grid-column>` is used to configure how a column in `<vaadin-grid>`
 * should look like.
 *
 * See `<vaadin-grid>` documentation and demos for instructions and examples on how
 * to configure the `<vaadin-grid-column>`.
 * ```
 *
 * @extends PolymerElement
 * @mixes ColumnBaseMixin
 */
class GridColumnElement extends ColumnBaseMixin(DirMixin(PolymerElement)) {
  static get is() {
    return 'vaadin-grid-column';
  }

  static get properties() {
    return {
      /**
       * Width of the cells for this column.
       */
      width: {
        type: String,
        value: '100px'
      },

      /**
       * Flex grow ratio for the cell widths. When set to 0, cell width is fixed.
       * @attr {number} flex-grow
       * @type {number}
       */
      flexGrow: {
        type: Number,
        value: 1
      },

      /**
       * Custom function for rendering the cell content.
       * Receives three arguments:
       *
       * - `root` The cell content DOM element. Append your content to it.
       * - `column` The `<vaadin-grid-column>` element.
       * - `model` The object with the properties related with
       *   the rendered item, contains:
       *   - `model.index` The index of the item.
       *   - `model.item` The item.
       *   - `model.expanded` Sublevel toggle state.
       *   - `model.level` Level of the tree represented with a horizontal offset of the toggle button.
       *   - `model.selected` Selected state.
       *
       * @type {GridBodyRenderer | null | undefined}
       */
      renderer: Function,

      /**
       * Path to an item sub-property whose value gets displayed in the column body cells.
       * The property name is also shown in the column header if an explicit header or renderer isn't defined.
       */
      path: {
        type: String
      },

      /**
       * Automatically sets the width of the column based on the column contents when this is set to `true`.
       *
       * For performance reasons the column width is calculated automatically only once when the grid items
       * are rendered for the first time and the calculation only considers the rows which are currently
       * rendered in DOM (a bit more than what is currently visible). If the grid is scrolled, or the cell
       * content changes, the column width might not match the contents anymore.
       *
       * Hidden columns are ignored in the calculation and their widths are not automatically updated when
       * you show a column that was initially hidden.
       *
       * You can manually trigger the auto sizing behavior again by calling `grid.recalculateColumnWidths()`.
       *
       * The column width may still grow larger when `flexGrow` is not 0.
       * @attr {boolean} auto-width
       * @type {boolean}
       */
      autoWidth: {
        type: Boolean,
        value: false
      },

      /**
       * @type {Array<!HTMLElement>}
       * @protected
       */
      _cells: Array

    };
  }

}

customElements.define(GridColumnElement.is, GridColumnElement);
export { GridColumnElement };