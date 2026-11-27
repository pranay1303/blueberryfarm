import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Car,
  Check,
  CheckCircle,
  Eye,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/Modal';
import { ClearDataButton } from '../../components/ClearDataButton';
import { Badge, Button, LoadingSpinner } from '../../components/UiPrimitives';
import type { BookingEnquiry } from '../../types';

export const EnquiriesPage: React.FC = () => {
  const { addToast } = useToast();
  const [enquiries, setEnquiries] = useState<BookingEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Selected enquiry for view or review
  const [selectedEnquiry, setSelectedEnquiry] = useState<BookingEnquiry | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  // Review action modal state
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchEnquiries = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'ALL') params.status_filter = statusFilter;
      if (search.trim()) params.search = search.trim();

      const res = await api.get('/enquiries', { params });
      setEnquiries(res.data?.items || []);
    } catch (err: any) {
      console.error('Failed to load booking enquiries:', err);
      addToast('Failed to load enquiries', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnquiries();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEnquiries();
  };

  const handleOpenReview = (enq: BookingEnquiry, action: 'APPROVE' | 'REJECT') => {
    setSelectedEnquiry(enq);
    setReviewAction(action);
    setReviewRemarks(
      action === 'APPROVE'
        ? `Approved for ${enq.guest_name || enq.customer?.full_name || 'Guest'}. Cottage reserved.`
        : ''
    );
  };

  const handleSubmitReview = async () => {
    if (!selectedEnquiry || !reviewAction) return;
    if (reviewAction === 'REJECT' && !reviewRemarks.trim()) {
      addToast('Please provide a reason for rejecting the enquiry.', 'warning');
      return;
    }

    setSubmittingReview(true);
    try {
      const targetStatus = reviewAction === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const res = await api.post(`/enquiries/${selectedEnquiry.id}/review`, {
        status: targetStatus,
        remarks: reviewRemarks.trim(),
      });

      addToast(
        reviewAction === 'APPROVE'
          ? `Enquiry approved! Confirmed Booking Reference: ${res.data.booking_reference || 'Created'}`
          : 'Enquiry has been rejected.',
        'success'
      );

      setReviewAction(null);
      setSelectedEnquiry(null);
      fetchEnquiries();
    } catch (err: any) {
      console.error('Review failed:', err);
      addToast(err.response?.data?.detail || 'Failed to submit review', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_REVIEW':
        return <Badge variant="warning">Pending Review</Badge>;
      case 'APPROVED':
        return <Badge variant="success">Approved</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">Rejected</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Customer Booking Enquiries</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-[#004AAC] font-bold">
              Public Portal Inbox
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Review incoming public reservation requests, guest counts, vehicle registrations, and convert to bookings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchEnquiries} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
          <ClearDataButton section="enquiries" label="Enquiries" onCleared={fetchEnquiries} />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {(['ALL', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-[#004AAC] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL'
                ? 'All Enquiries'
                : st === 'PENDING_REVIEW'
                ? 'Pending Review'
                : st === 'APPROVED'
                ? 'Approved'
                : 'Rejected'}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-md w-full">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by name, mobile, reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#004AAC] focus:outline-hidden"
            />
          </div>
          <Button type="submit" size="sm">
            Search
          </Button>
        </form>
      </div>

      {/* Enquiries List */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner label="Loading public enquiries..." />
        </div>
      ) : enquiries.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 space-y-3">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-700">No Enquiries Found</h3>
          <p className="text-xs text-slate-500">
            {statusFilter !== 'ALL'
              ? `No booking enquiries matching filter '${statusFilter}'.`
              : 'Public booking requests submitted through your website will appear here in real-time.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {enquiries.map((enq) => (
            <div
              key={enq.id}
              className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:border-blue-400/80 transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
            >
              {/* Left Column: Reference, Customer Info */}
              <div className="space-y-1.5 flex-1 min-w-[260px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black text-[#004AAC] bg-blue-50 px-2 py-0.5 rounded-md">
                    {enq.enquiry_reference}
                  </span>
                  {getStatusBadge(enq.status)}
                  {enq.booking_reference && (
                    <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      Booking: {enq.booking_reference}
                    </span>
                  )}
                </div>

                <div className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>{enq.guest_name || enq.customer?.full_name || 'Guest'}</span>
                  <span className="text-xs text-slate-500 font-normal">
                    (Mob: {enq.guest_mobile || enq.customer?.mobile || 'N/A'})
                  </span>
                </div>

                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>{enq.package_name || enq.package?.name || 'Standard Package'}</span>
                  {enq.occasion && (
                    <span>• Occasion: <strong className="text-slate-700">{enq.occasion}</strong></span>
                  )}
                  {(enq.guest_city || enq.customer?.city) && (
                    <span>• From: <strong className="text-slate-700">{enq.guest_city || enq.customer?.city}</strong></span>
                  )}
                </div>
              </div>

              {/* Middle Column: Dates, Guests & Vehicles */}
              <div className="flex flex-wrap items-center gap-6 text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Stay Dates</span>
                  <span className="font-semibold text-slate-900 block">
                    {enq.check_in_date} → {enq.check_out_date}
                  </span>
                </div>

                <div className="border-l border-slate-200 pl-4">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Headcount</span>
                  <span className="font-bold text-[#004AAC] text-sm block">
                    {enq.total_guests} Guests
                  </span>
                  <span className="text-[10px] text-slate-500">
                    ({enq.adults}A • {enq.children}C • {enq.infants}I)
                  </span>
                </div>

                <div className="border-l border-slate-200 pl-4">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Vehicles</span>
                  <span className="font-bold text-purple-700 text-sm block flex items-center gap-1">
                    <Car className="w-3.5 h-3.5" />
                    <span>{enq.vehicles?.length || 0} Arriving</span>
                  </span>
                </div>
              </div>

              {/* Right Column: Actions */}
              <div className="flex items-center gap-2 w-full lg:w-auto justify-end pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedEnquiry(enq);
                    setIsViewModalOpen(true);
                  }}
                  title="View full enquiry details"
                >
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  <span>Details</span>
                </Button>

                {enq.status === 'PENDING_REVIEW' && (
                  <>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => handleOpenReview(enq, 'APPROVE')}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      <span>Approve</span>
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleOpenReview(enq, 'REJECT')}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      <span>Reject</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal 1: Detailed View Modal */}
      {selectedEnquiry && isViewModalOpen && (
        <Modal
          isOpen={isViewModalOpen}
          onClose={() => {
            setIsViewModalOpen(false);
            setSelectedEnquiry(null);
          }}
          title={`Enquiry Details: ${selectedEnquiry.enquiry_reference}`}
          size="lg"
        >
          <div className="space-y-6 text-sm">
            {/* Header info */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-xs text-slate-500 block">Enquiry Status</span>
                {getStatusBadge(selectedEnquiry.status)}
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Submitted At</span>
                <span className="text-xs font-semibold text-slate-700">
                  {selectedEnquiry.created_at ? new Date(selectedEnquiry.created_at).toLocaleString() : '-'}
                </span>
              </div>
            </div>

            {/* Customer Contact */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Customer Profile</h3>
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block">Full Name:</span>
                  <strong className="text-slate-900 block">{(selectedEnquiry as any).guest_name || (selectedEnquiry as any).customer?.full_name || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Mobile:</span>
                  <strong className="text-slate-900 block">+91 {(selectedEnquiry as any).guest_mobile || (selectedEnquiry as any).customer?.mobile || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Email:</span>
                  <span>{(selectedEnquiry as any).guest_email || (selectedEnquiry as any).customer?.email || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Address:</span>
                  <span>
                    {(selectedEnquiry as any).guest_address ||
                      [
                        (selectedEnquiry as any).customer?.address,
                        (selectedEnquiry as any).customer?.city,
                        (selectedEnquiry as any).customer?.state,
                        (selectedEnquiry as any).customer?.pin_code,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Stay & Requirements */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Stay & Requirements</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block">Check-in:</span>
                  <strong>{selectedEnquiry.check_in_date}</strong> ({selectedEnquiry.check_in_time || '12:00 PM'})
                </div>
                <div>
                  <span className="text-slate-500 block">Check-out:</span>
                  <strong>{selectedEnquiry.check_out_date}</strong> ({selectedEnquiry.check_out_time || '10:00 AM'})
                </div>
                <div>
                  <span className="text-slate-500 block">Package:</span>
                  <strong>{selectedEnquiry.package?.name || 'Stay Package'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Total Headcount:</span>
                  <strong className="text-[#004AAC] text-sm">
                    {selectedEnquiry.total_guests} Guests ({selectedEnquiry.adults} Adults, {selectedEnquiry.children} Children, {selectedEnquiry.infants} Infants)
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Occasion:</span>
                  <span>{selectedEnquiry.occasion || 'General Stay'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Food Preferences:</span>
                  <span>{selectedEnquiry.food_preferences || 'Standard'}</span>
                </div>
              </div>
              {selectedEnquiry.special_requirements && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <strong>Special Requests:</strong> {selectedEnquiry.special_requirements}
                </div>
              )}
            </div>

            {/* Vehicles Registered */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Arriving Vehicles ({selectedEnquiry.vehicles?.length || 0})
              </h3>
              {selectedEnquiry.vehicles && selectedEnquiry.vehicles.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedEnquiry.vehicles.map((v, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                      <div>
                        <span className="font-mono font-bold text-slate-900 block">{v.registration_number}</span>
                        <span className="text-slate-500">{v.type || v.vehicle_type || 'Car'}</span>
                      </div>
                      {v.notes && <span className="text-[11px] text-slate-400 italic">{v.notes}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-xl">No vehicles declared by guest.</div>
              )}
            </div>

            {/* Review status note */}
            {selectedEnquiry.reviewed_by && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
                <div>Reviewed by: <strong>{selectedEnquiry.reviewed_by}</strong> on {selectedEnquiry.reviewed_at ? new Date(selectedEnquiry.reviewed_at).toLocaleString() : ''}</div>
                {selectedEnquiry.review_remarks && <div>Remarks: {selectedEnquiry.review_remarks}</div>}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal 2: Review Approval / Rejection Modal */}
      {selectedEnquiry && reviewAction && (
        <Modal
          isOpen={true}
          onClose={() => {
            setReviewAction(null);
            setSelectedEnquiry(null);
          }}
          title={reviewAction === 'APPROVE' ? 'Approve Booking Enquiry' : 'Reject Booking Enquiry'}
          size="md"
        >
          <div className="space-y-4 text-sm">
            <div className={`p-4 rounded-xl text-xs flex items-start gap-3 ${
              reviewAction === 'APPROVE'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border border-rose-200 text-rose-900'
            }`}>
              {reviewAction === 'APPROVE' ? (
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <strong>{reviewAction === 'APPROVE' ? 'Confirming Stay' : 'Documenting Rejection'}</strong>
                <p>
                  {reviewAction === 'APPROVE'
                    ? `Approving will automatically convert enquiry '${selectedEnquiry.enquiry_reference}' into a confirmed Booking with vehicle passes and room allocation.`
                    : `Please record why this enquiry cannot be accepted (e.g. resort fully booked, private event clash).`}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                {reviewAction === 'APPROVE' ? 'Approval Notes / Room Allocation' : 'Reason for Rejection *'}
              </label>
              <textarea
                rows={3}
                required={reviewAction === 'REJECT'}
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
                placeholder={
                  reviewAction === 'APPROVE'
                    ? 'e.g. Cottage 1 & 2 assigned. Guest notified on WhatsApp.'
                    : 'e.g. Resort fully booked on requested weekend for private corporate retreat.'
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-[#004AAC] focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setReviewAction(null);
                  setSelectedEnquiry(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={reviewAction === 'APPROVE' ? 'success' : 'danger'}
                size="sm"
                onClick={handleSubmitReview}
                disabled={submittingReview}
              >
                {submittingReview
                  ? 'Processing...'
                  : reviewAction === 'APPROVE'
                  ? 'Confirm Approval'
                  : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
